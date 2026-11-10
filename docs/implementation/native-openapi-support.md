# Native OpenAPI support

**In progress. Complete native acceptance has not passed.**

BusyAPI targets native Swagger 2.0 and OpenAPI 3.0.x, 3.1.x and 3.2.x.
Standard YAML/JSON remain authoritative. Supported declarations are preserved;
opening, editing, saving, validating and rendering do not migrate documents.

## Authorities

Normative specification text takes precedence over informational schemas:

- [Swagger 2.0](https://spec.openapis.org/oas/v2.0.html)
- [OpenAPI 3.0.4](https://spec.openapis.org/oas/v3.0.4.html)
- [OpenAPI 3.1.2](https://spec.openapis.org/oas/v3.1.2.html)
- [OpenAPI 3.2.1](https://spec.openapis.org/oas/v3.2.1.html)
- [JSON Schema Core](https://json-schema.org/draft/2020-12/json-schema-core)
  and [Validation](https://json-schema.org/draft/2020-12/json-schema-validation)
- [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986),
  [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901),
  [RFC 2045](https://www.rfc-editor.org/rfc/rfc2045),
  [RFC 2046](https://www.rfc-editor.org/rfc/rfc2046) and
  [RFC 7578](https://www.rfc-editor.org/rfc/rfc7578)
- [YAML 1.2.2 anchors and aliases](https://yaml.org/spec/1.2.2/#3222-anchors-and-aliases)

## Implementation and verification status

The shared contract engine and canonical graph own semantics. Core owns approved
resource acquisition, immutable captures and safe publication. Desktop and CLI
consume those shared results. Source-preserving transactions remain authoritative.
Current changes require complete engine, Core, native and packaged verification;
source inspection or a successful build is not runtime acceptance.

## Active completion directive: application capabilities

The application-capability directive was established at
`8e36f53775b702050d6307a81936c5782ca520a0`. The W4.01 follow-up starts from
`28c65c5f6c66c1bd35d44f40f2055c533813f05e` on `release/v0.1.0`.
The revised completion directive supersedes every historical **next assignment**
in this file. Do not start B05-R3d-1b-5 or resume the migration microtask sequence.
Existing migration implementations, certificates and regression sources remain
intact. The W register remains the single detailed inventory; the application
matrix below controls priority. No additional tracking system is introduced.

**Neither SOURCE COMPLETE nor ACCEPTED is achieved.** The execution hold remains
active. This assessment uses production source and regression-source inspection;
it establishes no compilation, runtime, native or packaged acceptance. All new
coverage below is prepared and unexecuted. Installed SDK/dependencies remain
unchanged and Snapcraft remains skipped.

### Application implementation matrix

**I** = implementation found for the stated bounded workflow; execution is
unverified. **P** = concrete required implementation gaps found. **U** = existing
implementation found, but full requirement closure is unverified by this source
review; it is not classified as missing. **M** = required behavior absent in the
inspected consumer. Every cell has execution status **held / not run**. An I cell
does not establish full native-family acceptance. Patch recognition is by family;
acceptance must retain each exact authored patch declaration.

| Professional workflow | Swagger 2.0 | OAS 3.0.x | OAS 3.1.x | OAS 3.2.x | Production evidence and concrete boundary |
| --- | --- | --- | --- | --- | --- |
| Open/create YAML and JSON | I | I | I | I | `specification.ts`, Core `Initializer.create`/`BusyProject.open`; native20/native30, dialect and CLI fixtures. Creation writes the requested native declaration; opening does not migrate. |
| Design editing | U | U | U | U | `authoring.ts`, `contexts.ts`, `engine.ts` inspect/propose, native `designer/object_page.dart`; shared schema-type/value-form controls already exist. Complete field/position closure still requires W1 qualification; absence of executed tests does not mean absent controls. |
| Source editing/completion/diagnostics/navigation | U | U | U | U | `source_assistance.ts`, `document.ts`, Core `SourceAssistance`, native `source_editor.dart`/`source_intelligence.dart`; schema-form completion gap corrected below. Existing full-source manual editing, diagnostic and reference navigation paths are retained. |
| Reference inspection | U | U | U | U | `reference_projection.ts` referencePage/referenceDocument, native `reference_view.dart`/`reference_object.dart`; native family and reference-context fixtures. Complete native clause/rendered-field closure remains unverified. |
| Version-specific validation | U | U | U | U | `structural_schema.ts`, restricted/Swagger validators, `schema_evaluation.ts`, graph dialect policy, Core check; existing restricted/modern/access/negative suites. Full normative coverage is not established by source review. |
| Reference resolution/navigation | U | U | U | U | `reference_graph.ts`, `reference_choices.ts`, source assistance and Core resource capture; contextual/dynamic/native-connection suites exist. Full external/mixed-role qualification remains unverified. |
| Reference maintenance/refactoring | P | P | P | P | `refactoring_copy.ts` extract/move/inline, file/property/Markdown owners, Core file/refactoring transactions and native review, CLI refactor. W6-M1 resource relocation and W6-M2 shared Markdown/compatible ownership separation are source-complete, unverified within their stated proof boundaries. General schema-position and mixed-reference-role closure, unavailable dynamic proofs and full workflow qualification remain explicit. |
| Native documentation/export | U | U | U | U | `reference_projection.ts`, `derived_bundle.ts`, Core `documentation.dart`/`documentation_sources.dart`, native documentation actions, CLI build-docs. Native offline HTML publication exists; complete relocation/rendering closure and pinned adapter compatibility remain unverified (W6.04). |
| Requests/responses/authentication | P | P | P | P | Core `request.dart`/`execution.dart`, shared execution/security/runtime owners and native Request controls; existing HTTP/security/header/media suites. W4.01 typed multipart, W4.04/W4.05 XML/Linkset and W5.01/W5.02 incremental streaming are source-complete, unverified within their recorded representation and resource boundaries below. Standard implemented security flows are not missing because execution is held; full device-flow qualification remains unverified. |
| Example interpretation/selection | P | P | P | P | `example_representation.ts`, serialized/external example owners and Core captured selections; native external-body and CLI saved-case paths exist. W4.07 retains binary Parameter/Header/part choice gaps; occurrence-free reusable media must not guess context. |
| Mock execution/response validation | I | I | I | I | `mock_server.ts`, `mock_native_validation.ts`, generation adapter and Core `mock.dart`; exact external-byte/status/header/schema checks exist. W5.03/W5.04 are source-complete, unverified for approved pinned CONNECT peers and the bounded constructive witness classes in the final W5 handoff. Unsupported representations/search exhaustion remain explicit unavailable results. |
| Contract testing | P | P | P | P | Core `execution.dart` and CLI test use native request/response evaluation and saved cases. Existing conformance/HTTP/CLI fixtures are unexecuted; captured wire models and incremental streaming now share Core/native/CLI execution; remaining representation limits and qualification remain explicit below. |
| CLI headless workflows | P | P | P | P | `packages/busyapi_core/bin/busyapi.dart` dispatches init/check/lint/bundle/build-docs/refactor/migrate/diff/mock/test/import/generate to Core. Native family/reference/refactoring CLI suites exist. Shared execution/media/maintenance gaps also affect CLI; a desktop completion popup is not a separate CLI requirement. |
| Save/reopen/source retention | I | I | I | I | Core document store/publication and engine CST edits retain declaration, exact numbers, extensions, BOM/newlines and unaffected source; no-op/ownership/transaction/publication fixtures exist. Current-revision execution remains held. |

W4.01 typed multipart generation is **SOURCE COMPLETE, unverified** within the
codec, representation and resource boundaries in the W4.01 handoff below. This
is a capability status; neither overall BusyAPI SOURCE COMPLETE nor ACCEPTED
is achieved.

The following gaps have direct production evidence rather than just missing test
results. They are required native application work, not specification limits:

| Capability | Current implementation | Missing consumer behavior / completion criterion |
| --- | --- | --- |
| XML wire model | SOURCE COMPLETE, unverified for captured, unambiguous XML 1.0 representations. | W4.04: shared codecs, canonical composition/reference proofs, native/Core/CLI workflows and registered regressions are recorded below. |
| Linkset wire model | SOURCE COMPLETE, unverified for RFC 9264 text/JSON and HTTP-compatible Link content. | W4.05: shared model, actual Header production, native/Core/CLI workflows and registered regressions are recorded below. |
| Incremental streaming | W5.01/W5.02 SOURCE COMPLETE, unverified through the existing HTTP transport. | Incremental framing, captured item evaluation, bounded retention/backpressure, native live inspection/Stop, cases/CLI and exact mock/proxy forwarding are recorded in the streaming handoff below. Whole-content proof remains gated on actual EOF and the original evaluator budgets. |
| CONNECT mocks | W5.03 SOURCE COMPLETE, unverified within the explicit approved-peer policy. | Node connect transport, original operation/security/constraints, bounded pinned peers, bytes/FINs, cancellation/closure and native/CLI events are connected; see the final W5 handoff. |
| Mock witnesses | W5.04 SOURCE COMPLETE, unverified for the constructive classes in the final W5 handoff. | Finite/exact, pattern, composition/recursive and supported text/binary candidates require original-schema proof; arbitrary patterns/dynamic constraints and exhausted bounds remain unavailable, never unsatisfiable. |
| Semantic maintenance | Ordinary reviewed rename/extract/inline/move/file actions exist in native and CLI consumers. | W6-M1/M2 implement complete-resource relocation, shared Markdown specialization and compatible literal/contract separation. W6.01–03 still require general schema-position/mixed-reference-role qualification; precise unavailable proofs and actual independent-data conflicts remain refusals. |

### Active product completion continuation (2026-11-10)

The current continuation starts at `dc7f4451d5554e0535ac716dcc08778ccc12c3ce`
in the primary `release/v0.1.0` checkout. The complete product objective remains
active; this is not a replacement inventory or a new migration sequence.

W4.02/W4.06/W4.07 now additionally retain approved external Parameter examples
as capture-bound native selections. Parameter-level complete serializations and
content-level media bytes use their actual effective name/location/media. The
shared serializer frames binary and non-UTF-8 media octets without Unicode
replacement; whole-query form delimiters retain their authored representation.
Native draft restoration requires the same project/operation/snapshot and byte
identity. Editing explicitly selects literal input. Preparation, saved-case
review and runtime evaluation reject stale resources. `parameterExamples`
saved choices reopen through the same owner in Core and independent CLI, with
no competing literal inputs or additional resource acquisition. Original-schema
runtime and mock validation now percent-decode all content media as octets;
whole-query content no longer passes through named-query UTF-8 parsing. Header
controls retain legal horizontal tabs. Empty query/cookie collections omit wire
fields; empty strings remain explicit values, including matrix `;name`.

Prepared, **not run**: the registered runtime-parameter engine suite adds binary
query/path/Header/whole-query, charset, malformed-escape and byte-length cases;
Core `external_parameter_selection_test.dart` adds actual HTTP, saved review,
cold reopening, independent CLI, missing/stale choices and cancellation
in YAML/JSON for 3.0.4/3.1.2/3.2.0/3.2.1. The existing native external-body
journey also selects and sends a binary query example. Existing producer
fixtures retain obsolete controls and add prior-octet-producer rejection.
Schema producer is `hyperjump+busyapi-exact` **1.18.0+68**, with
`parameter-media-octets-v1`; Parameter producer is **7**, `parameter-wire-v7`.
Request Parameter example representation is now **2**, and part example
representation is **1**, strictly admitted by Core. Migration
**104**, multipart **2**, stream **2** and other existing identities are retained.

The same continuation additionally connects approved captured bytes to the
existing multipart file/MIME pipeline. Native part controls require an explicit
concrete media choice; preparation checks token/project/operation/part/media
ownership and current approved bytes. Saved `files` retain their relative path
with `capturedExample: true`; cold reopening refuses absent captured resources
instead of falling back to upload acquisition. Generic MIME Header controls
project actual Header occurrences and select external/serialized examples through
the shared capture and original body/Header proof. Data Header examples use the
existing Core Parameter serializer. Legal ASCII horizontal tabs are retained;
structural and ignored form-data fields keep their existing owners.

`request_examples.ts` contains the existing request example projection moved
from `execution.ts`, shared with multipart controls. It also preserves both
native choices when 3.2 `dataValue` coexists with external/serialized content;
no reusable component media type is inferred. External control metadata omits
duplicate payload bytes. Response Header projections now include their native
examples. Source-only preparation adds Core `external_part_selection_test.dart`
(actual multipart exchange, byte identity, Header examples, stale/cancelled
inputs, saved review, cold reopen and independent CLI), native
`external_part_example_request_test.dart` (actual part/Header selection and HTTP),
and cases in the registered multipart-header and external-example engine suites
(empty names, separate data/wire choices, byte ownership and negative original
proof). These are all **unexecuted**. A mistaken buffer-ID argument in the
prepared Parameter save regression was corrected by source review.

Overall **INCOMPLETE, unaccepted**. Remaining W1/W6 production-consumer
reconciliation, documentation integration,
W2/W3 reconciliation and the complete W7 acceptance journeys remain unfinished.
The confirmed W1.13/application device-flow omission is now implemented at
source level, unverified. Request projection retains `deviceAuthorizationUrl`
only in an admitted 3.2 Security Scheme flow. Core `OAuthClient.deviceAuthorization`
uses the existing bounded OAuth POST transport and original Bearer token validator;
authorization-code and client-credentials methods retain those same owners.
The device flow retains scope and client-authentication settings, defaults to
public-client authentication, displays only the public user code/verification
URI, observes the declared interval, adds five seconds on `slow_down`, and backs
off after an owned exchange timeout. Denial, expiration, other OAuth errors,
malformed metadata, redirects, local deadlines and cancellation terminate the
grant without exposing response bodies/device codes. Pending delay timers have
removable cancellation ownership. Stale plans reject each subsequent request
and token publication. Native authorization uses the existing session secret
store, scope/expiry ownership and late-result guards; its verification action
rejects obsolete prompts. Request OAuth representation **1** is strictly admitted.

Prepared, **not run**: registered `test_execution.cjs` checks native device-field
projection and older-family exclusion; Core `oauth_device_authorization_test.dart`
uses controlled device/token/API HTTP endpoints, actual polling/slow-down/backoff,
cancellation, expiry, denial, invalid/redirect/stale controls, authenticated
execution, saved credential references and independent CLI secret input. Native
`oauth_device_request_test.dart` covers prompt/session token/request/Cancel and
obsolete verification actions for both 3.2 patches. Existing OAuth regressions
retain the shared authorization-code/client-credentials transport checks.
The normative basis is OAS 3.2.1 OAuth Flow Objects and RFC 8628 §§3.1–3.5.
No metadata discovery acquisition or unsupported token type is inferred.

W6's existing inline owner now supports a single substitution at an independent
use of a static recursive schema. Every copied static reference retains its
original unchanged target; the algorithm never recursively expands the graph.
Its normal canonical target/dialect/connection, literal, Markdown, YAML and CST
proofs remain mandatory. A retained recursive target containing the edited
occurrence remains a located `refactor.inline.recursive` unavailable proof;
copied IDs/anchors and reachable dynamic-scope dependencies retain the existing
refusals. This implements an established static equivalence through the existing
transformation, rather than introducing a new certificate sequence.
Prepared, **not run**: `test_refactoring_copy.cjs` compares original-schema
instances and graph targets at body/content Parameters, Responses, properties,
items, composition, contains, dependent schemas, callbacks/webhooks, MIME Header
schemas and 3.2 itemSchema, with local/external recursive definitions in all
native families and YAML/JSON. Identity/dynamic and edited-recursive-target
negative controls remain. Core `recursive_schema_inlining_test.dart` exercises
actual review/apply, cancellation/staleness, Undo/Redo, cold reopening, original
schema proof and independent CLI review/publication. Native
`recursive_schema_inline_test.dart` exercises Design's existing inline action,
review Cancel/Apply, retained recursive targets, exact values and history in
all four families. No refactoring producer/protocol or semantic engine was
replaced. General mixed-role/ownership reconciliation is still unfinished.

W6.04 native documentation/export now enumerates the canonical graph's complete
interpreted scopes, including a physical object used as both Schema and another
native object. Each section, reference target and incoming usage retains its
actual interpretation and Markdown base. Secondary views receive separate
read-only display coordinates; native source actions and portable export
provenance retain the original pointer and optional `viewKind`. Source, API
bundling and semantic owners are unchanged. Reference document, display and
display-packet producers are **3**, strictly admitted by Core and the existing
renderer owner. First-party Redoc/Swagger adapter identities are **9**/**8**;
third-party package pins are unchanged. Prepared, **not run**: registered
Reference display and Core documentation suites cover overlapping Schema/Header
roles in 3.1.2/3.2.0/3.2.1, distinct source actions and targets, Markdown bases,
offline publication, exact source retention and rejection of producer **2**.
Full rendered-field/relocation and packaged adapter acceptance remain held.

W1.08–W1.10 Source assistance now selects the captured enclosing role for a
multiply interpreted physical object. Design and Reference already offered
their canonical role controls; Source previously used only the primary scope.
The existing assistance owner now supplies role-specific field help, complete
and partial-key completions, reference candidates/definitions and incoming
usages. Native Source's existing popup offers the captured interpretations;
changing roles reruns the same job and expected-text writer. Source actions
reject obsolete caret/generation/snapshot/role choices; history, full-source
editing and physical source ownership remain unchanged. Core strictly admits
`busyapi-source-assistance` **2**; fold metadata remains its existing protocol.
Prepared, **not run**: the registered Source type suite adds 3.1.2/3.2.0/3.2.1
YAML/JSON role help, completions, usages and unavailable-role controls; Core and
native Source suites cover explicit choice, expected edits, Undo/Redo, save,
stale action rejection and obsolete producer refusal. W1's remaining complete
field/position reconciliation is not replaced by this confirmed omission fix.

W4.07 saved body example selection now distinguishes an empty named Example
from the legacy unnamed-occurrence sentinel. `externalExample: {name: ""}`
retains the empty key through the existing case transaction/reopening owner;
existing string selectors are unchanged. Prepared, **not run**: the existing
external-body Core suite covers binary bytes through save, cold reopening,
actual HTTP and independent CLI for the empty named choice. No schema producer
change is needed for this selector-preservation correction.

W7/W8's existing `native_application_workflow_test.dart` now prepares the
established warehouse fixture journey in both YAML and JSON for all four
families. It connects Design summary editing, external-schema Source completion,
Reference, reviewed component rename, grouped save/cold reopen, offline native
documentation, version-specific validation and independent CLI check with actual
authenticated POST/GET execution, inherited Unicode path/query/Header inputs,
exact request/response numbers, saved credential references/cases, cold replay
and independent CLI secrets input. The same reopened graph starts native mock
execution, with exact-minimum and missing-auth controls beside a validated
example response. Existing invalid-Source/Undo/disk-retention checks remain;
YAML adds BOM/comment/CRLF retention without converting parsed source numbers.
This coverage is **prepared, not run**. Existing XML/Linkset, multipart, streaming,
CONNECT, migration publication, recovery and native graphical suites remain
separate registered acceptance infrastructure; this extension does not establish
those journeys or current-revision acceptance by implication.

No boundary is reclassified as a target-specification restriction. Only source
inspection, official specification/RFC reads, Git inspection and
`git diff --check` have been performed. The execution hold and Snapcraft skip
remain active; no compiled/generated asset or dependency has been changed.

### Ordered phases and completion criteria

1. **Native OpenAPI support.** Complete native document authoring, validation and
   maintenance for all four families. Establish explicit field/position closure
   through shared metadata, Design, Source and Reference; handle family schema,
   resource and reference semantics; close W6 native maintenance gaps. Preserve
   declarations, unrelated bytes and review/Undo/Redo safety. Completion requires
   no known native authoring/maintenance gap; unexecuted coverage remains a
   separate verification status. The bounded W1 schema/reference authoring
   completion below extends the existing Source schema forms. The bounded W6-M1/M2 increments below are source-complete, unverified.
   Reconcile remaining Phase 1 clause/surface and proof boundaries against this
   matrix; do not turn every unavailable refactoring proof into another narrow
   assignment. The next concrete application implementation priority is typed
   multipart generation (W4.01), with native professional workflow integration.
2. **Application functionality.** Complete the explicit wire/multipart/example,
   mock, streaming and documentation gaps above through every applicable native,
   Core and CLI consumer. Completion requires no required consumer to retain an
   implementation refusal for supported native behavior and all corresponding
   positive/negative acceptance procedures to be prepared. Existing safe
   acquisition and source transactions remain authoritative.
3. **Migration reconciliation.** Independently reconcile approved conversions
   with the existing W2/W3 implementations. Preserve originals and representable
   conversions; require located accurate incompatibility/unavailable-proof
   diagnostics, no partial publication and stale/cancel/race safety. Classify
   remaining cases as implemented, required mapping gap, proved target restriction
   or extended coverage needing evaluation. Historical example/Header inverses,
   saved raw/file inverses and other specialized conversion certificates remain
   explicit evaluation items; they are not discarded or native-support gates.
   Completion requires approved safe behavior accounted for, not arbitrary new
   certificate coverage or treating a missing algorithm as a target restriction.
4. **Acceptance.** After authorization lifts the execution hold, execute the
   complete current-revision procedures below with official unmodified
   dependencies. Completion requires passing automated, native and packaged
   verification, with no hidden incomplete outcomes. No held gate can be marked
   passed. SOURCE COMPLETE requires Phases 1–3 implemented and Phase 4 prepared;
   ACCEPTED additionally requires Phase 4 to pass.

### Application acceptance matrix and procedures (prepared; held)

Use a customer-style inventory/order API in each native family, in both YAML and
JSON: GET collection/item, POST creation, path/query/header parameters, reusable
item/error schemas and references in a second file, required and optional fields,
security, success/error responses, examples and a saved authenticated case. Keep
an extension payload containing a literal `$ref`, a number beyond binary64,
Unicode, `info.version` unrelated to the specification declaration, and comments,
BOM/newline variants where applicable. Preserve original bytes for comparison.
Concrete JSON baseline contracts are authored under
`fixtures/native_application/{swagger20,openapi30,openapi31,openapi32}/api.json`,
with independently referenced `models.json` in each directory. They retain
family-specific bodies, responses and nullable schemas, API-key security and
exact extension/example numbers. The prepared
`packages/busyapi_core/test/native_application_workflow_test.dart` consumes them
through open/check, Reference, Design's captured API, external-schema Source
completion, component rename, offline documentation, save/cold-reopen, CLI check
and invalid Source/Undo. It is included by the existing Core directory gate.
This is partial combined journey coverage, not executed acceptance. The full
authenticated byte-exchange/case/mock journey, YAML/comment/BOM counterparts,
version-specific advanced media variants and native/packaged presentation still
require the combined procedures and existing fixtures below.

| Family | Required native contract features | Negative and version-specific controls | Existing regression starting points |
| --- | --- | --- | --- |
| Swagger 2.0 | host/basePath/schemes, consumes/produces, body and formData/file operations, collectionFormat, definitions/parameters/responses/securityDefinitions, Basic/API-key/OAuth declarations, schema/examples on responses | Reject modern-only native objects; distinguish flat Parameter/Items/Header from Schema; response file restrictions, tuple items, readOnly/required; no silent 3.x conversion | Core/native `native_swagger20_test.dart`, engine `test_native_families.cjs`, Swagger media/header/parameter suites |
| OAS 3.0.x | servers, schema/content parameters, requestBody/content/encoding, components, links/callbacks, nullable, boolean additionalProperties, HTTP/Bearer/API-key/OAuth security | Reject boolean items, null type, modern-only schema keywords and reference siblings; required items for arrays; nullable versus enum behavior, read/write direction | Core/native `native_openapi30_test.dart`, restricted-schema, schema-value-form and native-family suites |
| OAS 3.1.x | webhooks/reusable Path Items, boolean/union schemas, `$id`/anchors/dynamic references, dialect declarations, nullable represented natively as schema unions, modern Reference descriptions | Unknown/malformed dialects remain unavailable/invalid rather than defaulted; resource/dynamic scope and `$ref` sibling rules, exact numeric constraints, access annotations | dialect/schema-resource/reference/access suites, Core `reference_family_context_test.dart`, engine `test_reference_families.cjs` |
| OAS 3.2.x | query/additionalOperations with exact spelling, querystring, reusable media/itemSchema, positional/nested Encoding, dataValue/serializedValue/externalValue, tag parent/kind and security URI additions | Illegal media/example combinations, conflicting Encoding forms, incorrect occurrence context, malformed/truncated streams, XML/Linkset models and CONNECT tunnel behavior after implementation | generic/positional/nested multipart, runtime-media, native-connection, external-example and custom-method suites |

Run this complete sequence for **every family and format**, then exercise all
published patch declarations represented by the existing fixtures without
normalizing their spelling:

1. Open the existing contract and separately create a new contract through native
   creation and CLI init. Confirm family/declaration and independent API version.
2. Validate with native diagnostics and CLI check; locate each expected negative
   diagnostic in its authored resource. Unsupported evaluation must not pass.
3. Inspect operations, schemas, security, examples and resolved cross-file
   references in Reference from both saved and unsaved captures.
4. Use Design to change a response schema/constraint, parameter and example.
   Inspect effective family-specific fields; exercise Undo/Redo and validation.
5. Use Source to make a semantic edit, complete legal schema values, navigate a
   reference and repair an intentional invalid edit using located diagnostics.
6. Review/apply a rename and definition/file move; check every affected reference
   and Markdown base, unchanged payload lookalikes and stale-review rejection.
7. Send local controlled HTTP requests with selected security/examples; compare
   exact request/response bytes, repeated fields and original-schema conformance.
   Execute saved cases through native and CLI; negative cases must fail without
   false complete results. Exercise mocks and each applicable wire/stream model.
8. Export native offline documentation and reopen its artifacts; inspect every
   operation/schema/reference/example and relocated link. Qualify external
   adapters separately and expose their limitations without rewriting source.
9. Save, close and cold reopen the project and external files. Revalidate via
   native and CLI; repeat the saved request/test from the reopened capture.
10. Compare the exact specification declaration, unrelated API version, extension
    data/numeric lexemes, BOM/newlines/comments and unaffected source ranges.
    Include cancellation, stale resources, conflicting destinations and injected
    publication failures; originals must survive every failed operation.

Migration acceptance is independent: run all twelve directed family routes and
same-family patch behavior over representative approved conversions. Compare
source/target request, response, reference, security and schema behavior; check
review diagnostics/decisions and target native reopen. Assert no outputs on
unsupported/unproved conversions, cancellation, stale capture or atomic
publication failure. Retain original contracts/configuration and use cold target
reopening after moving/removing original locations to expose accidental ties.
Existing migration engine/Core/native suites and `native_migration_preflight.py`
provide starting coverage; this is not authorization for more specialized maps.

**Exactly blocked by the execution hold:** TypeScript compilation and engine
bundle generation/engine regressions (`tools/build_engine.sh`); test-runtime and
CLI compilation (`tools/prepare_test_runtime.sh`); Core tests; Flutter code
creation/analyze/widget/native graphical workloads; release build/package;
current-revision CLI byte exchanges and export artifacts; native family journeys
1–10; migration runtime equivalence/transaction journeys; installed/package
qualification and performance gates. `tools/build_linux.sh` documents the current
ordered engine/assets/runtime/analyze/widget/Core/release/package gates; it has
not been invoked. Missing implementation and the remaining combined journey fixtures
must still be completed while execution is held. Snapcraft remains skipped.

### Source schema value-form integration

Source insertion, incomplete-key repair and scalar-value replacement now consume
the existing `schemaValueForms` metadata used by Design, rather than assuming
all schema fields begin as objects. Modern schema-valued fields offer objects
and booleans; restricted/Swagger fields retain their captured per-occurrence
forms, including tuple items and boolean additionalProperties. Unsupported
dialects offer no guessed forms. Field choices have distinct labels; the same
immutable expected-text edits, Core capture validation and native Source input
transaction retain stale checks and history. No migration code/protocol changed.

Prepared unexecuted coverage extends the already registered
`test_source_type_choices.cjs` for all published patches and both source formats,
new/partial keys and scalar repair, legal native schemas, exact source retention,
unknown dialect and payload controls. Core `source_assistance_test.dart` adds
four-family completion/Undo/Redo/validation/save/cold-reopen with BOM and exact
extension numbers. Native `source_intelligence_test.dart` adds four-family real
completion-popup acceptance through the existing editor transaction/history/save
path. Those files are already selected by existing engine/Core/widget gates.
Source inspection and `git diff --check` only were performed. This closes this
specific Source metadata integration gap at source level, unverified; it does
not certify the complete Source subsystem or any phase as complete.

### W1 native Schema Object and Reference Object authoring completion

The assigned schema/reference authoring portions of W1.08–W1.10 are
source-complete on source inspection, with prepared regressions unexecuted.
This does not mark all W1, Phase 1 or BusyAPI source-complete or accepted.
Normative boundaries are the versioned specifications in Authorities above,
particularly Swagger §6.4.18, OAS 3.0 §4.7.24, OAS 3.1 §4.8.24,
OAS 3.2 Schema Object/Reference Object clauses and JSON Schema Core §8.

Already implemented: shared family-specific field metadata, Swagger Schema
versus Parameter/Items/Header traversal, restricted versus modern schema
types, schema-valued field forms, reference choices/navigation, recursive and
dynamic graph edges, resource identities/dialects, exact CST values and lazy
schema/Reference trees. Core's captured inspect/propose, Source assistance,
history, external-change detection and publication remain the editing owners.
Their existing coverage was unverified, rather than evidence of missing code.

Confirmed omissions corrected:

- Design now exposes the existing captured data editor for complete schema
  occurrences and navigable schema-valued fields. Object/boolean transitions
  and Swagger tuple items no longer require abandoning Design. Schema map and
  applicator-array creation accepts the engine's permitted entry forms.
- Whole-schema edits, collection entries and boolean toggles use the same
  context-bound schema-form descriptors and recheck the current graph after
  earlier transaction actions. The existing field descriptors remain intact.
  Proposals reselect an established matching graph role when Core's physical
  property session omits the presentation role. This also covers schema-valued
  fields whose Schema Object interpretation is not the physical primary; it
  never invents a schema role at a data position. The schema-form regression
  exercises that actual Core target shape and retains independent native
  validation of the same shared content.
- Source repairs scalar schema occurrences in maps and composition arrays
  through those same forms. Payloads and unsupported dialects acquire no
  guessed completions. The new Source schema-form implementation is retained.
- Shared fields include `$vocabulary`; nested `$schema` insertion is unavailable
  when the graph establishes an intrinsic subschema without its own resource
  identity. Unknown dialects do not offer assumed keyword authoring. Design's
  keyword picker respects these shared prohibitions.
- Native Reference explains restricted-schema `$ref` as a Reference Object,
  retaining ignored-sibling boundaries. Modern `$ref` remains a schema
  applicator. Schema pages expose the graph's effective dialect, supported
  status, resource identity, address and located resource owner. Dynamic
  targets stay explicit; no resource is flattened or reference evaluated by UI.

Prepared coverage extends the registered engine `test_authoring.cjs`,
`test_source_type_choices.cjs`, `test_schema_value_forms.cjs` and
`test_reference.cjs`; Core `source_assistance_test.dart` and
`native_application_workflow_test.dart`; native `schema_value_forms_test.dart`,
`source_intelligence_test.dart` and `reference_objects_test.dart`. Engine cases
cover Swagger 2.0, 3.0.0–3.0.4, 3.1.0–3.1.2 and 3.2.0–3.2.1 in YAML/JSON,
schema-bearing native/keyword positions, legal/illegal forms, dialect locations,
references, recursion, independently identified resources and exact numbers.
The combined Core journey edits an external schema through Design's production
API and Source, reads Reference, validates, rejects a stale action, undoes/redoes,
saves and cold reopens. It retains the native declaration, unrelated source,
BOM, CRLF, YAML comments/aliases, extension payloads and exact numeric lexemes.
Native cases exercise complete-value forms and Source popup acceptance.
Existing assertions and source-fidelity controls remain present. All files
remain covered by the existing engine/Core/widget directory gates.

Verification is separate: only source inspection and `git diff --check` are
authorized here. No compiler, analyzer, test, engine generation, graphical
workload, build, CI, performance check or packaged acceptance has run. The
execution hold remains active; Snapcraft remains skipped. No dependency or
third-party source changed. B05 migration assignments remain suspended. The
next Phase 1 work is W6 semantic maintenance; typed multipart, XML/Linkset,
streaming and mocks retain their Phase 2 priority before advanced migration.

### Phase 1 continuation: schema applicator maintenance

After the bounded authoring completion, W6 source inspection confirmed that
`planOwnedCopy` rejected every object with `$ref`/`$dynamicRef`, and native
Design hid extraction/definition-move review for all such occurrences. Modern
schema applicators with authored siblings are now eligible for the existing
reviewed operation. `contexts.ts` supplies that distinction to inspect, Design
and the refactoring owner; Flutter has no version/schema rule of its own.
Pure forwarding objects and restricted/non-schema Reference Objects keep
their previous boundary.

Relocation also treated all `$dynamicRef` fields as dynamic-anchor addresses,
even when the canonical graph establishes a static starting target without
`$dynamicAnchor` (Core §8.2.3.2). It now builds that target's static address and
retains the authored `$dynamicRef` keyword. Anonymous cross-resource extraction
distinguishes these static edges from genuine dynamic edges. The existing
checks still compare every repaired target, resource/dialect context and
dynamic candidate set, and prove cold retrieval closure. Genuine inherited
dynamic resources, ambiguous literal/role owners, independent identities and
incompatible rendering bases retain their existing proof/refusal paths.

Prepared unexecuted engine regressions extend `test_refactoring_copy.cjs` for
modern published patches, YAML/JSON, same/cross-resource extraction, static and
dynamic references, exact sibling constraints and independent positive/negative
instance oracles. Genuine cross-resource dynamic-scope refusal is retained.
Core `refactoring_copy_test.dart` adds review-without-mutation, captured Apply,
Reference, stale rejection, Undo/Redo, exact source/BOM and save/cold reopening.
The native schema-form suite checks that modern applicator siblings expose
the existing extraction and move review actions. Existing assertions remain.
All suites were already registered; none ran. Source inspection and
`git diff --check` are the only verification performed.

This closes these specific W6 omissions at source level, unverified. W6 is
still partial: independently identified/dynamic inlining, general inherited
resource relocation, shared Markdown rendering contexts and dual-role/literal
ownership specializations remain Phase 1 work. Phase 2 wire/multipart,
XML/Linkset, streaming and mock gaps still precede advanced migration. The
execution hold, skipped Snapcraft and no-push policy remain in force.

## B05-R3d-1b-4: Mixed-media reusable-owner specialization

**B05-R3d-1b-4 is source-complete, unverified for the established named and
positional-default certificate families. R3d-1b and R3d as a whole remain
incomplete and unverified.** This assignment starts at
`d658518b3710a7fc2de315a7fd6d520c847fcf97` in the primary `release/v0.1.0`
checkout. Earlier repeated-name, finite-name/interleaving and finite tuple
certificates remain authoritative. No execution acceptance is claimed.

Media ownership now distinguishes a captured consumer from its reusable
definition. A graph-derived occurrence retains its entry, native
request/response/Parameter/Header role, actual media key and parameters,
definition and reference chain, family/dialect/base/resource contexts, whole
schema, itemSchema and applicable Encoding coordinates. Named certificates
are keyed by this complete occurrence identity and final target. An eligible
form occurrence can obtain its own proof even when another consumer uses JSON,
different media parameters, or another multipart interpretation. A matching
JSON Schema alone does not establish media or serialization equivalence.

`materializeMediaReferences()` still owns envelope materialization. Its local
conversion coordinates retain original CST field provenance; copied root
provenance no longer turns another actual content entry into this consumer.
Whole schemas, item schemas, named Examples and Encoding Headers forward to
their neutral definitions. A definition or intermediate alias in a separate
file receives a neutral native component through the common allocator and
entry/role relation before its last Media Type reference retires. Identified
schemas are never duplicated into those envelopes. Literal values and original
external resource identities remain independently owned. Existing terminal
reference repair, schema/resource proofs and Markdown/example relocation
remain authoritative; there is no new ownership registry or resolver.
Generated contract edges are captured before reusable Media components move,
including fresh neutral targets. The common terminal-reference repair then
composes their physical CST moves as well as entry/role refinements. This keeps
new named value-schema references valid after later component relocation;
reference-looking literals never enter that inventory.

After materialization, an actual content key determines Encoding applicability.
CST copy provenance is no longer pooled back into the unbound reusable
definition. Inactive positional/named rules retain literal history and neutral
Header/schema owners without becoming active target instructions. An unbound
or established non-sequential JSON/text itemSchema retains its neutral schema
without adding an array assertion to that consumer. Actual multipart rules
retain the existing named or positional-default proofs. Even empty rules with
a captured part model must preserve source/target defaults, including nested
array defaults. Media ranges without one established interpretation retain
an unavailable-proof refusal. `multipart/mixed` does not receive invented form
names or a form-data certificate.

`relocateMediaComponents()` still owns older reusable-component storage. Its
unused Response content placeholder supplies no authored media evidence and
adds no executable request or response alternative. The occurrence owners and
their schemas survive the 3.2 -> 3.1 -> 3.0 pipeline. Semantic provenance now
records Media Type uses themselves, including uses with no entering reference.
Final invariants prove each actual occurrence against its own delivered owner,
protect inactive consumers' neutral schemas and reject borrowed named rules.
Request signatures and saved structured-body projection select certificates
from the actual content occurrence rather than its terminal definition.

Core continues to capture unsaved resources immutably, inventory every output,
validate review packets and enforce stale/cancellation/destination/atomic
publication checks. Native review and CLI consume the same Engine changes,
located problems and configuration projections; neither adds media semantics.
Ordinary editing and saving do not invoke this migration.

Prepared **unexecuted** regression coverage is registered through existing gates:

- Engine `migration_b05_r3d1b4_fixture.cjs` is imported by the existing named
  fixture in `test_migration_form_media.cjs`,
  `test_migration_form_downgrade.cjs`, `test_migration_object_uses.cjs`,
  `test_migration_swagger_media.cjs` and `test_multipart_encoding.cjs`.
  Cases cover both 3.2 patches, YAML/JSON, 3.1 and composed 3.0 targets,
  JSON/form and compatible form/mixed consumers, multiple parameterized form
  keys, direct/content/chained/cross-file references, Parameter/Header and
  response JSON consumers, mixed-family schema entries, identified resources,
  inactive named rules, itemSchema, independently referenced Headers/Examples,
  external-example bytes, exact values, binary transfer bytes, stable plans
  and final-owner mutation controls. Empty/default conflicts and active mixed
  restrictions refuse every output. The R3d-1b-2 fixture now has a positive
  independent JSON/form case and retains its active mixed positional negative
  as a located target restriction.
- Core `migration_r3d1b4_fixture.dart` is imported through the existing
  form/binary/Swagger gates. It prepares unsaved cross-file captures, exact
  structured form projection beside unchanged saved JSON, cancellation, stale
  reviews, destination races, injected publication failure, blocked partial
  conversion, original preservation, packaged CLI preview, cold reopening
  after original deletion and canonical source/target evaluation of emitted
  request-builder bytes.
- The existing registered native multi-name/finite-tuple review fixture adds
  mixed reusable JSON/form variants for converted-owner/body display,
  publication and stale-review rejection. Packaged preflight adds mixed-media
  cross-file saved previews for both patches/formats and 3.1.2 plus every 3.0
  patch. Producer 103 is retained as an obsolete-package negative control.

Remaining boundaries are precise:

- An active generic positional rule differing from older defaults, or a named
  field whose positions require incompatible media/Headers/selection modes,
  remains a target restriction. A forbidden required interleaving also remains
  a target restriction; a mixed consumer set alone is no longer one.
- Unknown/recursive/over-budget schemas, unestablished names or codecs,
  ambiguous annotations and media ranges retain unavailable-proof diagnostics.
  There is no sampled completeness proof or universal field-order guarantee.
- Authored multipart example inverses and additional Header inverses remain
  **B05-R3d-1b-5**, the next assignment. Existing neutral references and external
  example preservation do not implement those inverses.
- Saved raw/file multipart inversion and complete production-byte/transaction
  reconciliation remain subsequent bounded work. Active response Encoding,
  nested Encoding and general typed positional multipart execution remain in
  their separately assigned R3d work. R3d-1c and R3d-2 were not begun.

Production files changed: Engine `migration_media_objects.ts`,
`migration_named_multipart.ts`, `migration_newer_objects.ts`,
`migration_positional_encoding.ts`, `migration_invariants.ts`,
`migration_multipart_configuration.ts`, `migration_schema_owners.ts`,
`migration_owner_references.ts` and `migration.ts`; Core `migration.dart`; packaged preflight
`tools/native_migration_preflight.py`. Other existing assertion edits synchronize
producer admission. Migration producer/Core/preflight advance **103 -> 104**.
Evaluator **1.18.0+62**, graph **9**, parameter mock **6**, response mock **5**,
sample **4** and schema-example projection **3** are unchanged.

Verification performed: source/ownership/protocol/gate inspection, normative
OpenAPI 3.2.1 media/Encoding applicability review, local Git inspection and
`git diff --check` only. No compilers, analyzers, tests, builds, code generation,
CI, graphical workloads or performance checks ran. The execution hold remains
active, bundles remain unbuilt and Snapcraft remains skipped. Prepared
regressions are not passing-test evidence. No third-party software or installed
official Flutter SDK changes, push or remote refresh were performed.

## B05-R3d-1b-3: Finite nonhomogeneous tuple values

**B05-R3d-1b-3 is source-complete, unverified for the established finite
certificate families below. R3d-1b as a whole remains incomplete and
unverified.** This assignment starts at
`e57575627c02786c87cb516beea12eab08e1521a` in the primary `release/v0.1.0`
checkout. The earlier homogeneous repeated-field and finite-name/interleaving
paths remain in use. No execution acceptance is claimed.

The existing `FiniteMigrationDomain` and canonical source evaluator still
establish completeness and membership. The named certificate now carries
finite tuple item applications alongside the exhaustive source and projected
languages. Uniform Schema Object `items` uses supported `anyOf`/`allOf`, exact
value guards and neutral value-schema references. The existing whole-object
`enum` supplies complete tuple membership, correlations, cardinality, repeat
order, requiredness and empty/omitted equivalence. A broad item union alone
never grants a new tuple. No positional keyword, tuple-valued `items`, invented
bound or sample-based finite domain is introduced into a 3.0 consumer.

Established inputs include two/three positions, different scalar types,
position `const`/`enum`, compatible composition and fixed references, finite
tails, optional positions, exact numeric literals, Unicode and empty strings.
The same proof supports shuffle-closed multi-name languages with heterogeneous
repetitions and whole-array correlations. A final 3.0 certificate is carried
through the intermediate 3.1 hop, including single-name consumers. Publication
reconstructs that same generated schema through the existing named invariant;
the finite interleaving and exact-value machinery is not duplicated.

Annotation applicability is separate from assertion equivalence. Guarded
branches retain original defaults, examples, documentation and other supported
value annotations through common allocator references. A value cannot acquire
an annotated owner used only at another position: a repeated exact value with
different annotated applications remains unavailable proof. Ambiguous
annotated alternative covers and array/wrapper annotations without an
established named location also remain unavailable. Item uniformity now checks
documentation and extension identity as well as assertions. Neutral original
array owners can lower direct finite positional applications using guarded
references to their original items; independently referenced schemas and
defining resources retain their own assertions, annotations and provenance.
No source document is modified in place.

The canonical MIME, FormSemantics and MultipartEncoding owners still govern
serialization. A shared JSON media choice can retain different scalar kinds
without a positional schema decoding hint. Compatible uniform text hints
retain their existing proof. Unknown hints are not copied from another
position; position-specific formats remain in their guarded owners. Every
field still requires identical media alternatives/parameters, charset,
explicit/default selection, Header applicability and transfer/binary binding.
Incompatible media/Headers retain target-representation diagnostics. Missing
decoding evidence, unsupported target codecs and conditional binary/transfer
bindings inside item alternatives remain unavailable-proof diagnostics. An
exhaustively forbidden cross-name interleaving remains a target restriction.

Structured saved values use the existing projection and captured source/target
schema evaluations. There is no new Core/native/CLI serialization rule or
review packet shape: exact numeric spelling, item order, empty/omitted parts,
media/Header selections and surrounding configuration retain the existing
checks. Binary references continue through the established homogeneous path;
heterogeneous conditional binary codecs and saved file/raw inverses are not
admitted. Cancellation, stale captures and safe publication continue through
the common transaction path. The migration producer, Core admission and
packaged preflight admission advance together from **102** to **103**; 102 is
obsolete. Evaluator **1.18.0+62**, graph **9**, parameter mock **6**, response
mock **5**, sample **4** and schema-example projection **3** are unchanged.

Prepared **unexecuted** coverage is registered through the existing gates:

- Engine `migration_b05_r3d1b3_fixture.cjs` is called by the existing R3d-1b
  fixture in all five media, downgrade, multipart, owner and Swagger suites.
  It covers both 3.2 patches, YAML/JSON, 3.0.0–3.0.4, two/three scalar
  positions, exact numbers, const-only hints, composition, whole-array
  constraints, finite tails, optional/absent fields, repeats/correlations/null,
  text/JSON wire decoding, byte-order/Header mutation controls, referenced and
  shared identified owners, YAML aliases and actual annotation traces through
  the canonical evaluator. Negative controls cover unbounded values/tails,
  incompatible media/Headers/text hints, conditional binary codecs, ambiguous
  annotations/access semantics, saved-value reversal and Swagger refusal.
  Final-correspondence controls mutate item guards, whole tuples and codecs.
- Core `migration_r3d1b3_fixture.dart` is registered through the existing
  form/binary/Swagger fixture gates. It prepares unsaved finite-tuple captures,
  structured exact-number/empty/omitted projections, cancellation, stale
  review, publication races, original-file preservation, packaged CLI previews,
  cold reopening and real request-builder bytes evaluated against both
  captured source and target schemas after original deletion.
- The existing registered native review fixture adds finite-tuple 3.0 review,
  converted schema/Encoding and saved-body display, publication and stale
  review controls. Packaged preflight adds finite-tuple saved previews across
  both source patches, both formats and all five 3.0 patch targets. Existing
  positive/negative R3d-1b-2 bodies remain, with current producer assertions.

Production changes are `migration_multipart_tuples.ts`,
`migration_multipart_language.ts`, `migration_named_multipart.ts`,
`migration_schema_tuples.ts`, `migration_finite_domain.ts`, `migration.ts`,
Core `migration.dart` and `tools/native_migration_preflight.py`. Saved-value
projection, request profiles, final invariants, native review and CLI consume
the existing common proof/projection paths.

Verification performed: source/protocol/ownership/gate inspection, local Git
inspection and `git diff --check` only. The execution hold remains active:
no tests, compilers, analyzers, builds, code generation, CI, graphical workloads
or performance checks ran. Prepared regressions are not passing-test evidence.
No bundles were rebuilt; Snapcraft remains skipped. No third-party or installed
official Flutter SDK changes, push or remote refresh were performed.

**Next assignment: B05-R3d-1b-4 — Mixed-media reusable-owner specialization.**
That work, example/Header inverses, saved raw/file multipart inversion, final
production-byte/transaction reconciliation and R3d-1c were not started here.
The preceding assignment records below are historical evidence of their own
producer revisions, not statements that the new finite tuple path is absent.

## B05-R3d-1b-2: Finite names and representable multi-name multipart

**B05-R3d-1b-2 is source-complete, unverified for the established certificate
families below. R3d-1b as a whole remains incomplete and unverified.** This
assignment starts at `6d27df3aeb1339cf33284dac549f0daa18df7441` in the primary
`release/v0.1.0` checkout. The existing repeated singleton-name certificate
and regressions remain the first path. R3d-1c, nested Encoding, response
Encoding and general typed positional multipart execution have not begun.

The schema-proof owner now provides a bounded, fixed same-instance alternative
cover for references, compatible `allOf`, `anyOf` and `oneOf`. The existing
finite-domain owner tries complete alternative domains before structural
products. Neither owner takes names from requests, examples, filenames or
Content-Disposition. Field identities retain exact property spelling,
including Unicode, JSON Pointer escapes and MIME quoted pairs. Names follow
the existing bounded printable multipart policy; lone surrogates cannot
establish a lossless UTF-8 name.

Two multi-name certificate families are implemented:

- A finite name skeleton with homogeneous independent value constraints per
  field. Established array bounds delimit the complete name language, while
  field values remain symbolic, including unbounded strings and binary value
  schemas. Every permitted name sequence must be closed under cross-name
  interleavings. The target retains exact correlated field-count alternatives,
  total cardinality, requiredness and omission. Whole-array uniqueness becomes
  per-field uniqueness because singleton maps with different names cannot be
  equal. Exclusive alternatives with overlapping names do not obtain this
  symbolic certificate.
- A complete finite exact-value language supplied by the existing finite-domain
  owner and filtered by the canonical exact evaluator. Fixed references,
  composition, closed object-property products and whole/part `const` and
  `enum` can establish this language. Exhaustive interleaving membership
  preserves each field's repeated-value order. Exact target object enums
  preserve correlations, field bounds, uniqueness, omission and explicit empty
  selections. Independently defined value schemas remain neutral references;
  finite alternative item constraints are supported for 3.1. The 3.0 path
  requires the established homogeneous mapping per field, and reuses the
  existing null-only representation. It does not implement nonhomogeneous
  finite tuple lowering.

A forbidden member of the exhaustive interleaving closure is a target
restriction. Fixed-name positional arrangements can also obtain that
restriction from a native-evaluated valid sequence and its invalid shuffled
counterpart. Such a witness only disproves equivalence; it never proves finite
completeness or discovers names. Unknown languages, recursive/dynamic evidence,
unestablished codec hints, unsupported conditions and exhausted proof budgets
retain unavailable-proof diagnostics. Several names alone no longer imply a
target restriction. Enumeration is bounded by 2048 candidates/objects,
8 MiB literal domains, 50000 proof states and 128 MiB captured-source evaluation
work. No bound is invented for an unbounded name or value language.

Each proved field has its own uniform Encoding certificate. Canonical media,
FormSemantics and MultipartEncoding owners compare all applicable positions,
complete media alternatives and parameters, charset, explicit/default
selection, schema transfer/binary bindings and independent Header identities.
Physical source codec paths are checked as well as logical branch constraints.
A conditional transfer rule, incompatible position rule or missing source hint
cannot be merged into one named field. No codec is added.

The certificate and A01–A03 projection carry every field. Selected request
consumers receive local generated schemas and Encoding maps; original schemas,
Headers, resource identities, references, YAML aliases, comments and literal
history retain their independent owners. The existing incompatible mixed-media
reusable-owner blocker remains. Final request profiles and publication compare
all fields, correlated schema assertions, neutral schema/Header targets,
media alternatives and selection modes. Reference-looking objects inside
literal enums remain literal data during this comparison.

Saved structured ordered values project only when their exact cross-name
choice can be represented by the current grouped-field serializer. Field
insertion order, associations, repeated-value order and numeric spellings stay
exact. A name recurring after a different field is an explicit
`migration.multipart.saved-proof` refusal, even when the declaration's language
is shuffle-closed. Already named values retain their empty/omitted field
coordinates and receive a validated source inverse. Source and target native
evaluation protect each saved inverse. Media/Header selections, authentication,
Servers and environments remain unchanged. Core and packaged preflight verify
the exact grouped structural projection; the multi-name review packet carries
`multipart.names`, while existing single-name packets keep `multipart.name`.

The existing invariant module also exposes an actual-MIME-buffer comparison
using the canonical framing and quoted-name parser. It compares complete
per-field Header/media/disposition correspondence and actual part body octets,
retaining repeat order and multiplicity. It does not infer equivalence from
matching decoded objects. Such buffers are not available for every publication
representation; complete production-byte/transaction reconciliation remains
subsequent work, as assigned.

Prepared **unexecuted** coverage is registered through the existing gates:

- Engine `migration_b05_r3d1b2_fixture.cjs`, called by the unchanged single-name
  test bodies in the existing media, downgrade, multipart, owner and Swagger
  suites: two/three names, Unicode/quoted pairs, finite name enums/consts,
  symbolic values, correlations, same-name repeat ordering, uniqueness, lower
  and upper counts, explicit empties/omissions, exact numbers, field defaults,
  compatible/incompatible media/Headers, binary octets, external/shared
  schemas/Headers, aliases, same-context reusable media, mixed-context
  refusals, finite order counterexamples, unknown/invalid/recursive/over-budget
  proofs, saved projections and final-owner mutation controls. Both 3.2 patches,
  YAML/JSON and applicable 3.1/3.0 targets are included.
- Core `migration_r3d1b2_fixture.dart`, imported through the existing R3d-1b
  fixture in form/binary/Swagger gates: unsaved buffers, saved three-name
  projections, empty/omitted values, cancellation, stale review, destination
  race/publication failure, original-file preservation, CLI preview and cold
  reopening. Prepared real request-builder bytes are evaluated through both
  canonical source/target MIME paths after original deletion.
- Native `migration_multi_name_multipart_review_fixture.dart`, called by the
  registered named review fixture: unsaved owner/body review, three names,
  publication and stale-review rejection.
- Existing packaged preflight suite: three-name YAML/JSON previews across both
  patches and targets, exact-number/order/selection mutation packets, explicit
  empty fields and obsolete producer rejection. The preflight result now
  retains its already-established complete status for these assertions.

Production changes are `migration_multipart_language.ts`,
`migration_named_multipart.ts`, `migration_schema_proofs.ts`,
`migration_finite_domain.ts`, `migration_multipart_configuration.ts`,
`migration_server_configuration.ts`, `migration_invariants.ts`, `migration.ts`,
Core `migration.dart` and `tools/native_migration_preflight.py`. Other existing
regression edits only update producer admission or register the new fixtures.
Migration producer/Core/preflight admission is **102**; **101** is obsolete.
Evaluator **1.18.0+62**, graph **9**, parameter mock **6**, response mock **5**,
sample **4** and schema-example projection **3** remain unchanged. No bundles
were rebuilt.

Verification performed: source, protocol, ownership and gate inspection, local
Git inspection and `git diff --check` only. The execution hold remains active:
no tests, compilers, analyzers, builds, code generation, CI, graphical workloads
or performance checks were run. Prepared tests are not passing-test evidence.
Snapcraft remains skipped. No third-party software or installed official
Flutter SDK changes, push or remote refresh were performed.

Remaining R3d-1b work is finite nonhomogeneous tuple mapping, mixed-media reusable
ownership, example/Header inverses, saved file/raw multipart inverses and
complete production-byte/transaction reconciliation. Those tasks and R3d-1c
were not started here. The earlier R3d-1b record below describes producer 101
and its then-current gaps; it is retained as historical evidence.

## B05-R3d-1b: Named multipart continuation (partial source implementation)

**R3d-1b remains incomplete and unverified. It is not source-complete.**
This continuation starts at `63c1f4718608a100537e3b5c2ce961cc000ed4e0`
on the primary `release/v0.1.0` checkout. The positional-default certificate
and previous work remain in place. R3d-1, B05-R3d, B05 and W3.09 remain
incomplete. R3d-1c, nested Encoding, response Encoding and general typed
multipart execution (W4.01) have not begun in this continuation.

A named content certificate now proves the closed singleton-name bijection
`[{n:v0}, ..., {n:vk}]` to `{n:[v0, ..., vk]}`. It obtains names from captured
unconditional schemas and fixed references, never filenames or one payload.
Repeated-field order follows RFC 7578 §5.2. Array bounds, uniqueItems,
whole-array const/enum constraints and applicable positional value-schema
conjunctions travel through that bijection. The 3.1 target retains finite
prefix constraints; the 3.0 path requires established homogeneous item
constraints. Unbounded homogeneous tails stay symbolic. Field requiredness
also accounts for const/enum exclusion of the empty array. Missing body,
absent field, selected empty array and empty part values retain separate
configuration coordinates.

Complete effective media alternatives and parameters, charset, explicit versus
default selection, schema transfer annotations and independently defined part
Headers must agree across every applicable position and the tail. One named
Encoding cannot replace conflicting positional rules. The existing MIME,
transfer, schema-reference, array-bound and assertion proof implementations
supply the evidence. No codec, schema evaluator or ownership registry is added.
Part and whole schemas and Headers retain neutral owners through A01–A03;
only the selected media envelope receives the generated named schema and rule.
Existing media materialization separates request envelopes and YAML aliases.

Planning, final request profiles and the existing positional publication
invariant consume the named certificate. The final check compares the complete
projected array assertions, neutral value-schema constraints and targets,
Header constraints and targets, media alternatives and selection mode. It
rejects extra fields/rules and changed bounds, original values or Header
requirements. This is a bounded language/codec correspondence; complete
production comparison of actual serialized multipart bytes for all reviewed
representations is **still missing**.

Saved ordered singleton maps project into exact named arrays through reviewed
`/tests/i/body` records. Already named arrays with a captured source inverse
remain unchanged. Source and target schema evaluation validates the inverse;
number spellings, empty values and unrelated body settings remain exact. Core
and packaged preflight admit only this structural bijection and preserve the
original media, authentication, Server and environment settings. No MIME logic
is duplicated in Dart. Existing native review and CLI expose these body records
and all changed source owners through their shared review/publication paths.

| Remaining R3d-1b gap or refusal | Classification / required continuation |
| --- | --- |
| Several fixed names imposing cross-field order | Target restriction: older object-based form-data cannot guarantee that order. This does not establish a restriction for every multi-name array language. |
| Finite-domain name discovery or multi-name languages closed under all permitted interleavings | Unavailable proof: finite-domain factorization/shuffle certificates are not implemented. |
| Nonhomogeneous finite 3.0 repeated-value tuples, despite potentially finite representable languages | Unavailable proof: this named certificate has not integrated exhaustive finite tuple lowering. |
| Shared reusable Media Type with different effective form/non-form media contexts | Unavailable proof: per-context neutral Media Type specialization remains unfinished. Same-context request materialization does not close this gap. |
| Position-dependent media, Headers or explicit/default selections for one repeated name | Target restriction in one older named Encoding owner. |
| Unknown identities, unestablished homogeneous tails, style/nested rules, missing decoding evidence, resource-recursive structural inverses | Unavailable proof; no guessed names, finite truncation or target incompatibility claim. |
| Authored multipart examples requiring value restructuring; unsupported Header-content/resource lowerings | Unavailable representation/inverse proof; retained declarations cannot silently lose their independent choices. |
| Saved file inputs without captured payload bytes, raw multipart saved values, unsupported saved shapes or incompatible entry inverses | Explicit `migration.multipart.saved-proof` / `migration.multipart.saved-context` blocker; no saved input or media selection is discarded. |
| Complete actual-byte production invariants and full cross-component regression matrix | Implementation remains unfinished. Prepared decoder comparisons do not constitute full serializer equivalence or executed acceptance. |

Prepared **unexecuted** regressions extend all five requested Engine suites
through `migration_b05_r3d1b_fixture.cjs`. They cover both 3.2 patches,
YAML/JSON, direct 3.1/3.0 targets, repeated/fixed same-name positions,
optional finite prefixes, symbolic tails, conflicting rules, unknown names,
cross-field order refusals, media alternatives, encoded and raw binary octets,
external schemas/Headers, same-context shared Media Types, YAML aliases,
saved exact values and selections, file-inverse refusal, cold reopening and
final-owner mutation controls. The different-media shared-owner case remains
a negative control rather than a claimed conversion.

Core's existing form/binary/Swagger gates import
`migration_r3d1b_fixture.dart` through the existing R3d-1 fixture, preparing
unsaved captures, saved projections, cancellation, stale reviews, destination
races, publication, CLI preview and cold reopening after original deletion.
The registered native migration review suite imports the named owner/body
review fixture. The existing packaged preflight suite prepares named saved
previews, exact projection packet controls and obsolete producer rejection.
No new runner or gate was introduced. Broader file/header-selection journeys,
actual source/target emitted-byte comparisons and the remaining requested
failure/ownership matrix are still outstanding.

Production files changed: Engine `migration_named_multipart.ts`,
`migration_multipart_configuration.ts`, `migration_positional_encoding.ts`,
`migration_newer_objects.ts`, `migration_invariants.ts`,
`migration_server_configuration.ts`, `migration.ts`; Core `migration.dart`;
and `tools/native_migration_preflight.py`. Other existing test assertion edits
synchronize migration admission. Migration producer/Core/preflight admission
is **101**; **100** is obsolete. Evaluator **1.18.0+62**, graph **9**,
parameter mock **6**, response mock **5**, sample **4** and schema-example
projection **3** are unchanged. Bundles remain unbuilt.

Verification performed: normative OpenAPI 3.2.1 §§4.14.5/4.15 and applicable
3.1.2/3.0.4 Encoding text, source/ownership/protocol/gate inspection, local Git
inspection and `git diff --check` only. The execution hold remains active:
no tests, compilers, analyzers, builds, code generation, CI, graphical or
performance checks ran. Prepared regressions are not reported as passing.
Snapcraft remains skipped. No third-party software or installed official
Flutter SDK changes, push or remote refresh were performed.

The listed R3d-1b implementation gaps must be completed before claiming its
source-complete handoff. The separately assigned next assignment remains
**B05-R3d-1c — Remaining union/conditional and binary equivalence proofs,
dedicated native review, complete positional Encoding regression matrix and
final R3d-1 reconciliation**; it has not begun here.

## B05-R3d-1: Positional Encoding (partial source implementation)

**R3d-1 is incomplete and unverified. It is not source-complete.** This work
starts at `2d7591b9813339d1e5a54c22f5a095f86c39a44b` on the primary
`release/v0.1.0` checkout. B05-R3d as a whole, B05 and W3.09 remain incomplete.
Nested and response Encoding remain R3d-2 and have not been implemented here.
This status supersedes the historical statement below that R3d has not begun.

A shared bounded positional certificate now uses the existing schema proofs,
fixed reference graph and array bounds. Non-form multipart positional rules
can retire when their complete permitted media interpretation equals the older
family's defaults. Prefix and tail partitions are considered together, including
positions with omitted Encoding declarations. Array upper bounds establish
always-absent positions; these are ignored rather than reported as missing
serialization values. The schema, array value model, constraints, part order,
count, omission behavior and literal operands are not rewritten by this path.
Multipart `itemSchema` uses the existing whole-content array conjunction and
shared allocator, retaining an independent original whole-schema resource.

The proof distinguishes whole-array JSON defaults in 3.2 from older item-based
array defaults, encoded strings from raw string values, active part headers
from ignored Content-Type headers, and explicit media alternatives from a
single default. It introduces no codecs. Non-form RFC6570 fields remain
ignored. Headers and their independently referenced schemas retire through the
existing allocator and terminal reference repair. Final publication re-derives
positional defaults from delivered schema owners after schema conversion and
reference repair; it also rejects newly activated named Encoding declarations.
The ordinary schema/resource and transactional invariants remain in force.

**Remaining implementation gaps:** named multipart conversions (including
single-name and repeated-name certificates), owner specialization for those
mappings, their saved-value/configuration projections, and complete multipart
wire invariants for any future named restructuring are not implemented. Uniform
union alternatives, conditional schemas whose wire interpretations agree, and
additional raw/encoded 3.0 cases remain outside this bounded certificate. These
are implementation/proof gaps, not claims that all such inputs are impossible.
Dedicated positional native review coverage, broader reusable-media/shared
Encoding/alias scenarios, and the full requested cross-component regression
matrix remain to be prepared. This work must continue within R3d-1 before the
separately assigned R3d-2 begins.

| Remaining refusal | Disposition |
| --- | --- |
| Unnamed positional media choices or active part/transfer headers differing from target defaults | Target restriction: no standard older positional Encoding owner; no fabricated form names or global header substitution. |
| Swagger active unnamed multipart instructions | Target restriction in its named formData representation. |
| Ordered form-data needing a named representation | Unavailable proof: identity/order/value-model mapping is not implemented. |
| Missing media/schema evidence, conditional/union shape applications, dynamic references, same-instance recursive proof or conflicting content annotations | Unavailable bounded equivalence evidence. |
| Existing named Encoding alongside positional rules | Unavailable applicability proof; conversion must not activate an ignored rule. |
| Nested or response Encoding | Separately assigned R3d-2; existing refusal remains. |

Prepared, **unexecuted** regressions extend all five requested Engine suites via
`migration_b05_r3d1_fixture.cjs`: both 3.2 patches, YAML/JSON, 3.1/3.0 targets,
optional positions and finite/variable tails, precise media/header/shape
refusals, independent absent Header schemas, exact integers, mixed structured
and base64 parts, cold reopening and a final-invariant mutation control.
Core's existing form-downgrade, binary and Swagger-media gates import
`migration_r3d1_fixture.dart` for unsaved captures, cancellation, stale reviews,
publication races, cold reopening, CLI publication and Swagger refusal.
Packaged preflight adds positional-default previews and producer 99 rejection.
The existing gates import the fixtures; no new test runner is introduced.

Production files changed: Engine `migration_positional_encoding.ts`,
`migration_newer_objects.ts`, `migration_media_schema.ts`,
`migration_invariants.ts`, `migration.ts`; Core `migration.dart`; native
preflight `tools/native_migration_preflight.py`. Other producer assertion edits
synchronize existing positive controls and retain previous negative controls.
Migration producer/Core/preflight admission is **100**; **99** is obsolete.
Evaluator **1.18.0+62**, graph **9**, parameter mock **6**, response mock **5**,
sample **4** and schema-example projection **3** are unchanged. Bundles remain
unbuilt; no runtime qualification of producer 100 is claimed.

Verification performed: normative OpenAPI 3.2.1 §§4.14.5/4.15 and corresponding
3.1.2/3.0.4 requirements, source/ownership/protocol/gate inspection, Git state
inspection and `git diff --check` only. The execution hold remains active: no
tests, compilers, analyzers, builds, generation, CI, graphical workloads or
performance checks ran. Snapcraft remains skipped. No third-party software or
installed Flutter SDK changes, push or remote refresh were performed.

## B05-R3c-3: Saved inverses, codecs, examples and reconciliation

**B05-R3c is source-complete, unverified within W3.09. B05-R3 and B05 remain
incomplete.** This continuation starts at
`879c884dfaac1a53e34fe1a16c9133c7b7591007` on the primary
`release/v0.1.0` checkout. It preserves R3c-1/2 and earlier implementations.
The current dispositions below supersede the historical R3c gap statements in
the following sections. R3d has not begun.

Raw saved whole-query inputs now resolve the original effective Parameter,
captured Media Type definition and Encoding instructions. The existing form
decoder supplies exact data tokens and field attribution/order; the captured
schema evaluator validates that inverse. The actual destination declarations
must reproduce every original query octet before a projection is offered.
Repeated names, multiplicity, field/item order, numeric exponent/decimal
spellings, literal plus signs and existing percent sequences remain material.
Missing input, selected empty text, selected empty collections and omitted
fields keep separate owners. Malformed escapes, invalid UTF-8, noncanonical
escape spellings, interleaved repeats and ambiguous or schema-invalid inverses
retain `migration.parameter.saved-proof`; decoding success never proves byte
equivalence. Arbitrary strings do not acquire a form binding.

Reviewed raw certificates include decoded exact JSON, destination selection
names and the physical target Parameter coordinates. Core reads those literal
declarations from the reviewed outputs and independently runs the existing
request serializer, including native `allowReserved` or Swagger collection and
escaping rules. This introduces neither a reference resolver nor a serializer.
Core admits only the recorded raw inverse, structured field move, cookie field
group, singleton-cookie unwrap or optional empty-text projection. Exact number
spelling, unrelated selections, environment values, authentication bindings and
cookie/query order remain protected. Destination collisions and incompatible
shared-case interpretations refuse publication. Cancellation, stale captures,
decisions, destination races and atomic publication retain the existing paths.

Finite form certificates distinguish content-based form encoding (`+` for
space) from explicitly styled Encoding and named RFC 6570 query expansion.
Field-specific reserved expansion is admitted only when its actual emitted
bytes match; literal percent triples and brackets receive the existing codec
rules. Swagger punctuation uses its actual Core codec, with a finite proof for
equivalent reserved-expansion downgrades in composed routes. Default/UTF-8 and
US-ASCII form bindings are the established codecs; ASCII certificates check
the complete permitted names and values. Nonempty whole-query JSON/text framing
cannot gain a named field without changing bytes. Optional empty text can keep
an explicit selection through an empty-array owner; required empty text retains
its presence restriction. An empty whole-query value language can use a proved
contradictory flat Swagger schema, while modern targets retain native content.

Literal-cookie scalar and singleton-array values can use older native
text/plain or JSON content where ordinary form escaping differs. JSON scalar
content preserves arbitrary numeric lexical spellings, including exponent `+`.
Independent finite cookie objects can project into separately owned fields;
the same exact domain/absence product certificate governs both query and cookie
groups. Semicolon delimiters, empty values, percent sequences and member order
remain literal. Cookie names are checked against other effective owners before
allocation. No percent decoding, duplicate-name merging or authentication
overwrite is introduced. Authentication collisions continue to fail before
secret acquisition.

The new `migration_parameter_examples.ts` projects examples through canonical
Example occurrences, existing representation rules and approved external-byte
captures. Parameter and Media Type selection layers retain their independently
named choices and their own schema-fallback precedence. `dataValue`, legacy
`value`, shorthand, `serializedValue`, paired representations and `externalValue`
use the defining serialization context. Serialized/external queries require the
same schema-valid exact inverse as saved inputs. Summaries, descriptions and
Markdown bases remain captured metadata. Original independently referenced
Example/Media/schema owners stay with A01–A03; projected literals receive fresh
provenance. External resource identities and bytes survive copying and cold
reopening, including multi-field projections retaining an original native owner.
Different values, metadata or external identities sharing an authored name
cannot be silently selected or renamed.

Authored example independence is proved separately from schema independence.
An extracted multi-field example relation must equal its complete product and
retain its field order. Missing projected members, newly implied combinations
or incompatible per-example group orders retain target restrictions. Generated
cookie content suppresses accidental reactivation of schema fallback choices.
The existing final publication invariant now re-derives every affected field's
domain, codec and presence, checks the full authored example relation, metadata,
external bytes and effective Operation field order, and supplies the associated
saved-value checks. No new invariant registry/evaluator was introduced.

| Remaining refusal | Classification and basis |
| --- | --- |
| Nonempty whole-query JSON or supported field-free text framing | Target restriction: a named query owner adds a field delimiter. |
| Native Cookie Parameters in Swagger | Target restriction: no native Cookie Parameter location; no Header substitution. |
| Correlated field/absence products requiring separate owners; required emitting groups without a presence coordinate | Target restriction where the identity-object alternative cannot preserve the codec. |
| Repeated literal cookie names with semicolon framing | Target restriction: older form uses ampersand grouping; duplicate native owners cannot retain the source ownership. |
| Correlated/incompletely projected examples, incompatible authored names/orders, active Parameter examples in Swagger | Target restriction in the approved target's independent example/Parameter containers. |
| Missing effective media/schema bindings, unsupported charsets, externally defined formats, ambiguous inverses, unavailable approved external bytes or exhausted finite proof budgets | Unavailable proof; no codec rules or claims of impossibility are invented. |
| Saved raw bytes that normalize differently, empty extracted groups without a selected owner, unaddressable empty names or out-of-certificate saved values | Unavailable saved proof; original configuration remains intact. |
| Positional, nested and response Encoding conversions | Separately assigned R3d; not implemented by this continuation. |

No established representable R3c implementation gap remains known after this
source reconciliation. This is a source assessment, not executed acceptance or
a claim that unavailable evidence establishes target incompatibility.

Prepared, **unexecuted** Engine coverage extends the registered migration,
entry-route, object-use, Swagger-media, runtime-parameter, serialized-example
and external-example suites. `migration_b05_r3c3_fixture.cjs` adds both 3.2
patches, YAML/JSON, applicable 3.0/3.1/Swagger direct/composed routes, raw and
structured values, repeated/empty/omitted fields, exact numbers, form/RFC 6570
punctuation, charset and malformed-input controls, cookie groups/singletons,
example precedence/products/references, external bytes, aliases, collisions and
final invariant mutations. Core's registered migration, wire and external-example
suites prepare actual HTTP/Cookie comparisons, unsaved review, original settings,
authentication collisions, cancellation/stale decisions, destination conflicts,
atomic failures, CLI preview/apply and cold reopening after original removal.
The registered native review suite adds raw configuration review/publication.
Packaged preflight adds the raw inverse matrix, malformed certificate controls
and obsolete producer rejection. Existing assertions and earlier suites remain.

Production changes: Engine `migration_parameter_serialization.ts`,
`migration_parameter_examples.ts`, `migration_parameter_configuration.ts`,
`migration_server_configuration.ts`, `migration_invariants.ts`,
`migration_example_versions.ts`, `runtime_form.ts`,
`serialized_parameter_examples.ts`, `execution.ts`,
`mock_request_parameters.ts`, `mock_native_validation.ts`,
`schema_evaluation.ts` and `migration.ts`; Core `migration.dart`, `request.dart`,
`exact_configuration.dart`, `project.dart` and `mock.dart`; and native preflight
`tools/native_migration_preflight.py`. Other test edits synchronize producer
assertions. Existing build/test registrations already include the extended
suites; the new fixture/module are imported by those registered paths.

Migration producer/Core/preflight admission is **99**; **98** is obsolete.
The shared evaluator is **1.18.0+62**, native parameter mock **6** and its
configuration is **parameter-wire-v6** because explicit empty exploded fields
no longer witness an omitted empty array. Graph **9**, schema-example projection
**3**, response mock **5** and sample producer **4** are unchanged. Bundles have
not been rebuilt.

**Verification actually performed:** normative specification and installed SDK
source inspection, source/protocol/regression-registration review, Git state
inspection and `git diff --check`. The execution hold remains active. No tests,
compilers, analyzers, builds, code generation, CI, graphical/native workloads,
packaging or performance checks executed. Snapcraft remains skipped. No
third-party software or official Flutter SDK was modified. No push or remote
refresh was performed. Prepared regressions are not reported as passing.

**Next assignment: B05-R3d — Advanced Encoding conversions, including positional,
nested and response Encoding Objects.** B05-R3/B05 and W3.09 remain incomplete
and unaccepted.

## B05-R3c-2: Multi-field factorization and grouped presence (historical)

**Implemented in source, unverified within W3.09. B05-R3c remains incomplete.**
This bounded continuation starts at
`34beb0d1bcc8f523b89ff28a83d4f13af62c36f4` on `release/v0.1.0`.
R3c-1 and the preceding migration paths remain in place. R3c-3, advanced
Encoding and R3d have not begun. This section supersedes the historical
multi-field/Swagger/grouped-presence gaps below, within the finite proof bounds.

Whole form objects can project to several standard named query Parameters.
`FiniteMigrationDomain` supplies an exhaustive superset and the captured exact
evaluator filters the complete original object language. The factorizer then
compares that relation with the full Cartesian product of the projected field
domains **and absence coordinates**, using canonical mathematical numeric and
object equality. It never establishes independence from separate field examples.
Dependencies, conditional requirements, composition, mutually exclusive values,
property counts and additional-property assertions are included in the original
evaluation. A successful projection therefore carries their complete effect;
correlations that remain outside independent Parameters retain a located
`migration.parameter.querystring-factorization` target restriction. Modern
scalar-object identity mappings can still preserve correlation in one object
Parameter when their established wire proof applies.

Requiredness follows permitted field presence. A required whole value does not
make all its properties required. An optional group contributes only the
all-absent tuple; it does not authorize partially populated tuples when the
source requires fields together. Required groups without an independently
required emitting field, and required extracted arrays admitting empty arrays,
retain precise target restrictions. Optional empty arrays remain selected array
values, distinct from omitted selections. Required scalar empty strings emit
`name=` and can supply presence. An explicitly saved empty group has no selected
field owner and retains `migration.parameter.saved-proof`, without deletion.

The original whole schema, property/item references and schema-resource
identities remain live typed owners through A01–A03 allocation and reference
repair. Each field receives its exact projected enum and applicable conjunctive
property schema references. Generated owners use the common allocator; reusable
Parameter chains and Path Item/Operation lists expand into ordinary references.
Additional-use provenance maps each source owner to its complete factor group,
while static references retain one canonical target. No proprietary Parameter
fields or runtime group validators are introduced.

Swagger uses the same field projection followed by the existing flat-schema
compiler: primitive Parameter types, concrete flat Items Objects and repeated
arrays with `collectionFormat: multi`. Standard `allowEmptyValue` accompanies
permitted empty strings, including empty array items, through direct and composed
routes. Flat target domains and codecs are independently re-evaluated at the
publication boundary. The normative basis is the
[Swagger Parameter clause](https://spec.openapis.org/oas/v2.0.html#parameter-object),
[Items clause](https://spec.openapis.org/oas/v2.0.html#items-object) and
[OpenAPI 3.2 Parameter clause](https://spec.openapis.org/oas/v3.2.1.html#parameter-object).
Unavailable concrete item/type/assertion certificates retain existing located
compiler findings; an object-valued Swagger non-body Parameter is never emitted.

The final wire invariant recomputes the complete source relation and every
actual target field domain, requiredness, type and codec. It rejects missing
fields and mutated names, values or serialization. Request profiles collapse a
factor group only when the effective operation contains its full set of fields;
retaining unused reusable definitions cannot conceal a partial operation group.
Review rows identify each destination name through the existing bounded records.

Structured saved objects project every selected field in source member order,
with exact literals, array order/multiplicity, unrelated settings and collision
checks retained. Core independently admits only whole-value identity moves or
nonempty, exact field extraction. Core's existing query serializer now visits
independent query selections in supplied selection order, preserving original
whole-form member order without a second serialization path. Raw inputs,
unknown saved fields, empty names unsupported by the saved-case consumer and
explicitly saved empty groups remain unavailable proofs. Remaining Example ownership/decoding work belongs to R3c-3; extracted
Parameter/Media and whole-schema examples retain `querystring-example-proof`. Existing scalar
identity Example mappings remain in place.

Prepared regressions, **not executed**, extend the existing engine migration,
entry-route, object-use, Swagger-media and runtime-parameter suites, using
`migration_b05_r3c2_fixture.cjs`. They cover both 3.2 patches, JSON/YAML,
3.0/3.1/Swagger direct and composed paths, independent/all-required/mixed fields,
optional groups, dependencies/conditions/counts/correlation restrictions,
empty strings and arrays, repeated values, exact numeric literals, aliases,
resource identities, saved collisions and final invariant mutations. Existing
R3c-1 negative controls now distinguish established factorization restrictions
from unavailable evidence. Core regressions prepare saved HTTP comparisons,
unsaved review, cancellation, controlled atomic failure, source deletion and
relocated cold reopening. Native review and packaged preflight regressions use
multi-field selections and the existing review/configuration consumers.

Production files: Engine `migration_parameter_serialization.ts`,
`migration_parameter_configuration.ts`, `migration_finite_domain.ts`,
`migration_invariants.ts`, `migration.ts`; Core `migration.dart`, `request.dart`;
and `tools/native_migration_preflight.py`. Other revision assertion changes
synchronize producer admission without changing earlier migration algorithms.

Migration producer, Core admission and preflight are **98**; 97 is obsolete.
Evaluator **1.18.0+61**, parameter mock **5**, configuration `parameter-wire-v5`,
graph **9**, schema-example projection **3**, response mock **5** and sample
producer **4** are unchanged. Bundles have not been rebuilt.

**Actual checks:** normative specification/source review, regression registration
inspection and `git diff --check` only. The documented execution hold remains
active: no tests, compilers, analyzers, builds, code generation, CI, graphical
workloads, packaging or performance checks ran. Snapcraft remains skipped.
No third-party software or Flutter SDK was modified. No push was performed.
Source implementation and prepared regressions do not establish runtime/native
acceptance. R3c-3 remains the next bounded assignment; all-R3c/B05 completion is
not claimed.

## B05-R3c-1: Single array field projection

**Single-field finite projection implemented, unverified. B05-R3c remains
incomplete.** This bounded continuation starts at
`188ff2f086e486fdc6b9d0bf87cd8831102e6961` on `release/v0.1.0`.
It does not begin R3c-2, R3c-3 or R3d.

The planner can extract one array property of a whole form object into a named
`in: query`, `style: form`, `explode: true` Parameter in OpenAPI 3.0/3.1.
The source property name becomes the query owner. The exact finite source
object domain is evaluated before extraction; its projected array enum carries
whole-object constraints, while an `allOf` reference retains the original
property's item/count constraints. The entire original schema stays in a typed
A01–A03 allocator owner. Referenced item/object schemas and shared Parameters
continue through canonical ownership and reference repair.

This is a one-field language proof, with no assumption that finite examples
establish a Cartesian product. The publication invariant recomputes both
complete domains, compares extracted values and complete ordered query fields,
and exercises captured source/target parameter inversion. Empty arrays remain
arrays; repeated identical values retain multiplicity and order. Exact number
literals are inserted as source text. Existing scalar-object and cookie paths
remain in place. Review records identify the destination field. Core and CLI
share the same projection records and producer admission.

Structured saved single-field objects move their array to its destination query
owner, with exact value checks and destination collision rejection. Core
independently admits only identity moves or single array field extraction;
unrelated selections must remain identical. Raw saved inputs, extra saved
fields and explicitly saved empty objects refuse publication with
`migration.parameter.saved-proof`; no saved selection is silently discarded.

Remaining boundaries are explicit unavailable proofs: unbounded/exhausted
source domains; absent property schema owners; multi-field/correlated splitting;
form/RFC6570 byte differences (including spaces); and required named arrays
that can emit no field. Required nonempty arrays and optional empty arrays
have separate admitted presence behavior. Extracted Parameter/Media examples
retain `querystring-example-proof` pending the independently assigned Example
mapping. General Swagger/grouped-presence work remains R3c-2; raw saved inputs
and remaining Example mappings remain R3c-3. No general one-to-many factorizer
or claim of all-R3c source completion is made here.

Production changes: `tools/contract_engine/src/migration_parameter_serialization.ts`,
`migration_parameter_configuration.ts`, `migration.ts`;
`packages/busyapi_core/lib/src/migration.dart`; and
`tools/native_migration_preflight.py`. Existing native review and CLI consumers
use the expanded records without separate serialization implementations.

Prepared regressions extend all seven requested production-path test files,
with `migration_b05_r3c1_fixture.cjs` and the existing Dart shared fixture.
Coverage includes both patches, JSON/YAML, direct/composed modern downgrades,
empty/singleton/duplicate arrays, length/item rejection, exact numeric elements,
Unicode/delimiter/percent bytes, shared/referenced owners, cross-field refusal,
saved arrays and collisions, invariant mutations, unsaved buffers, stale and
cancelled reviews, atomic failure and cold reopening. Existing negative cases
remain. Engine cases are registered through the existing `build_engine.sh`
entries; Core and native files remain in their existing directory discovery.

Migration producer, Core admission and preflight are **97**; 96 is obsolete.
Evaluator **1.18.0+61**, parameter mock **5**, configuration `parameter-wire-v5`,
graph **9**, schema-example projection **3**, response mock **5** and sample
producer **4** are unchanged. Bundles have not been rebuilt.

**Actual checks:** specification/source/registration inspection and
`git diff --check` only. All regressions are prepared, not executed. The execution
hold remains active; no tests, compilers, analyzers, builds, code generation,
CI, graphical workloads or performance checks ran. Snapcraft remains skipped.
No third-party software or Flutter SDK was modified. No push was performed.

## B05-R3c: Whole-query and finite cookie-style lowering

**B05-R3c is partially implemented, unverified within W3.09. It is not
source-complete. B05-R3 and B05 remain incomplete.** Work starts at
`ab7fd0648756e3a56fbe42a1db39a8c15524eb81` in the primary
`release/v0.1.0` checkout. A01–A03, B01–B04, B05-R1/R2 and R3a/R3b remain
the baseline. R3d, general Example, XML and discriminator work was not begun.

The normative basis is the versioned OpenAPI 3.2.0/3.2.1 Parameter clauses,
including whole-query Media Type ownership, RFC6570 versus form encoding,
literal cookie serialization and Appendix D, compared with OpenAPI
3.1.2/3.0.4 Parameter/content representations and Swagger's flat Parameter
categories. RFC6265 cookie name/value syntax and the installed Dart serializer
remain relevant to actual execution. The authorities above and
[Dart's form component encoding](https://api.dart.dev/dart-core/Uri/encodeQueryComponent.html)
were consulted; no third-party code or SDK was modified.

Implemented source paths:

- Finite, scalar-field whole form objects can retain their entire schema and
  data value in one native exploded `in: query, style: form` Parameter. The
  declared whole-query name remains an identity/selection key and does not
  become a wire field. Every admitted component must have identical form and
  RFC6570 encoding. Literal plus, reserved characters, Unicode and existing
  percent sequences retain their encoded bytes; domains containing spaces
  have no such identity-value certificate. Property iteration order is shared
  symbolically, rather than inferred from one enum object's ordering.
  A proved empty data language can retain its complete native content owner
  while changing only the location, including JSON media; no present field can
  enter that valid request language. Requiredness is unchanged.
- A finite cookie domain can use older form serialization when every emitted
  name/value, delimiter and omitted/empty behavior agrees. This includes
  applicable zero/singleton arrays and objects. Literal string domains can
  instead retain their schema in native cookie `content: text/plain`; legal
  `%20`, `+`, `/`, `=` and `!` octets need no invented escaping pipeline.
  Cookie content inversion now retains literal percent sequences. Existing
  parameter, explicit Cookie Header and authentication ownership remain the
  execution authority, including API-key cookie collision rejection.
- Parameter and Media Type chains use `ParameterSemantics` and
  `capturedRuntimeMedia`. Finite candidates use `FiniteMigrationDomain` and
  the exact captured evaluator, retaining approved retrieval aliases. Proof
  exhaustion produces unavailable evidence, never a truncated language. The
  publication invariant independently recomputes source/target domains,
  compares ordered fields, multiplicity, octets and presence, and exercises
  canonical parameter/media inversion against both original schema owners.
  Ordinary request/security invariants still apply. The common allocator,
  role/entry specialization, CST provenance and reference repairs own moves.
- Schema-ready Media Type examples move to the generated Parameter where
  their applicable selection layer is unambiguous. Original media/encoding
  envelopes retain history; schemas and referenced Examples retain typed
  owners. Existing broader Example refusals remain in effect.
- Captured structured saved values receive exact reviewed `querystring` →
  `query` location-key moves. Core admits only value-preserving key changes;
  occupied destination keys, incompatible shared case contexts and raw inputs
  without a decoding proof refuse publication. Captured saved inputs outside
  the schema domain also require actual codec equality. Environments,
  credentials, selections and unrelated fields keep existing exact checks.
- Bounded, located parameter-change records now feed Core, paged native review
  rows, source navigation, CLI JSON/text and publication metadata. The same
  configuration projection records remain shared across desktop and CLI.
  Explicit-only migration, unsaved document/configuration capture, stale and
  cancellation checks, conflict detection and atomic publication remain in the
  existing transaction path; these guarantees have not been re-executed here.

Remaining R3c implementation/proof gaps, **not claims of impossibility**:

| Boundary | Current disposition |
| --- | --- |
| Whole form arrays/repeated names, nested objects, field extraction or splitting, correlated cross-field languages | No complete target projection/value-mapping certificate is implemented. Finite domains alone do not supply it: `migration.parameter.querystring-proof`, unavailable proof. In particular a single property containing an exploded array can admit a named-query projection that this change does not implement. |
| Whole-query lowering into flat Swagger Parameters | Factorization, grouping/presence, independent ownership and saved-value mappings remain unimplemented: `migration.parameter.querystring-proof`, unavailable proof. This is not a blanket Swagger impossibility. |
| Spaces in whole form names/values, required whole forms that can emit no fields, unsupported cookie delimiters or numeric lexical languages | The implemented identity-value certificate does not establish equivalence. `%20` versus `+`, semicolon versus ampersand framing and exponent `+` spellings must not be inferred from enum representatives. Alternative finite projections still require implementation/proof. |
| Raw saved whole-query strings or captured values whose codecs differ | `migration.parameter.saved-proof`, unavailable proof. No silent decode/re-encode or selection deletion occurs. |
| Non-UTF-8 form media, plain text and other non-JSON media outside the empty-language mapping | `migration.parameter.querystring-media-proof`, unavailable proof. No unsupported charset or codec is declared impossible merely because the established UTF-8 scalar-form proof does not cover it. |
| Overlapping Parameter/media example layers; independently reusable form examples outside existing older-Example certificates | Existing `querystring-example-proof`/Example unavailable-proof boundaries remain. Direct data-only examples can follow the Parameter; this does not implement general Example serialization. |
| Non-default positional/nested/response Encoding instructions | `querystring-encoding-proof` or existing Encoding findings; R3d remains separately assigned. |
| Nonempty whole-query JSON framing; native cookie Parameters in Swagger | Located target restrictions (`querystring-target`, `cookie-target`). Adding a named field changes whole JSON framing; an ordinary Header does not establish a native Swagger cookie owner. Proved empty native data languages have the separate content-preserving mapping above. |
| Unbounded domains, missing effective schemas, incomplete native inversion or exhausted proof budgets | Unavailable evidence; no successful conversion or partial publication is claimed. |

Prepared regressions, **not executed**:

- Engine: the existing registered `test_migration.cjs`,
  `test_migration_entry_routes.cjs`, `test_migration_object_uses.cjs`,
  `test_migration_swagger_media.cjs` and
  `test_runtime_parameter_serialization.cjs` cover both 3.2 patches, YAML/JSON,
  direct/composed native downgrades, finite constraints, aliases/shared Media
  and Parameter owners, escaping, empty/absent values, cookie arrays/objects,
  literal percent sequences, exact saved moves, final invariant mutations and
  unpublished refusals. Fixture: `migration_b05_r3c_fixture.cjs`.
- Core: discovery includes `migration_parameter_serialization_test.dart` and
  the extended `parameter_wire_execution_test.dart`; shared fixture is
  `migration_r3c_fixture.dart`. Prepared actual HTTP/Cookie assertions include
  exact numeric tokens, saved cases/environments, authentication collisions,
  unsaved sources, repeat review identity, cancellation, stale configuration,
  destination races, controlled publication failure, CLI preview/apply,
  source deletion and relocated cold reopening.
- Native: discovery includes
  `migration_parameter_serialization_review_test.dart`, with parameter and
  configuration review, original preservation, unsupported/stale controls
  and cold opening. Preflight has packaged finite parameter/saved-value
  fixtures and bounded-record controls. Core/preflight reject producer 95;
  mock readiness rejects the previous cookie codec/evaluator identities.

Production files: Engine new `migration_parameter_serialization.ts` and
`migration_parameter_configuration.ts`; modified `migration.ts`,
`migration_newer_objects.ts`, `migration_invariants.ts`,
`migration_server_configuration.ts`, `security_configuration.ts`,
`mock_request_parameters.ts`, `mock_native_validation.ts`,
`schema_evaluation.ts`; Core `migration.dart`, `mock.dart`, `project.dart`;
native `lib/src/workspace/migration_review.dart`; CLI
`packages/busyapi_core/bin/busyapi.dart`; preflight
`tools/native_migration_preflight.py`. Other regression edits synchronize
producer assertions while retaining obsolete-producer controls.

Migration producer/admission/preflight **96**; evaluator **1.18.0+61** with
`literal-cookie-content-v1`; parameter mock **5**, configuration
`parameter-wire-v5`. Migration 95, evaluator `1.18.0+60` and parameter mock 4
are obsolete. Graph **9**, schema-example projection **3**, response mock **5**
and sample producer **4** are unchanged. Bundles have not been rebuilt.

**Actual verification:** specification and manual source/registration review,
Git state inspection and `git diff --check` only. No tests, compilers,
analyzers, builds, code generation, CI, graphical workloads, packaging or
performance checks ran. The execution hold remains active; Snapcraft remains
skipped. No push or remote fetch was performed. This partial implementation
does not meet the R3c source-completion criteria or complete B05-R3/B05.

**Historical next bounded work: B05-R3c-2, then B05-R3c-3.** R3d remains deferred
until R3c is source-complete. The historical R3c baseline above is superseded
only by the bounded R3c-1 changes documented in the preceding section.

## B05-R3b: Reusable Path Item and Media Type ownership

**B05-R3b is source-complete, unverified within W3.09. B05-R3 remains
partially implemented, unverified; B05 is incomplete.** This bounded assignment
starts at `3ce4f31b1d00d77882a7eb18da9b2526d3c0ce78` in the primary
`release/v0.1.0` checkout. A01–A03, B01–B04, B05-R1/R2 and R3a remain the
baseline. Partial R3c work is recorded above; B05-R4 has not begun.

The normative basis is Swagger 2.0 §§6.4.1, 6.4.5–6 (endpoint keys and Path
Item references), 6.4.12/15 (Response schemas and MIME-keyed examples),
6.4.18 and 6.4.20–23 (the available reusable categories), together with the
OpenAPI 3.0.4/3.1.2/3.2.1 Components, Path Item, Callback, Media Type,
Encoding and Reference clauses. These are the versioned authorities linked
above. Components have no API effect without an actual invocation/route use.
A fragment entered by a typed reference differs from unattached data in a file.

Implemented source changes:

- The final Swagger target is checked against captured Paths reachability
  before constructing any intermediate holder. Chained Path Item aliases and
  consumers in other captured documents count; references only to children and
  cycles/chains among otherwise unused definitions do not create an endpoint.
  Used Path Items retain the existing common fragment allocator, terminal
  reference repair, route planning, parameter inheritance and operation
  identity bijection. No route or HTTP method is synthesized for storage.
- Media context capture now includes every alias in a resolved chain. Each
  real content occurrence keeps its exact key and request/response/Parameter/
  Header context. Materialization shares child schema, named Example and
  nested Encoding Header targets instead of cloning their identities. The
  established itemSchema, default/inapplicable Encoding, form and metadata
  conversions remain authoritative for representable fields.
- On direct Swagger lowering, independently owned converted schemas and
  Headers leave the reusable media envelope through the common Schema and
  inactive Response.headers layouts. Existing Example materialization and
  literal history retain names, exact payloads and approved external bytes.
  The remaining envelope retires through existing CST history; it does not
  become a new Swagger component or an active media declaration.
- Bound media definitions in inactive 3.1/3.0 Response holders retain all their
  actual captured MIME keys. Additional envelopes refer to canonical children;
  identified resources are not duplicated. An unbound object's octet-stream
  placeholder remains inactive storage syntax and supplies no codec evidence.
  The Callback holders used by 3.0 likewise add no invocation or public route.
- A library's original independent Path Item and media-child interpretations
  are proved even when only another delivered entry enters their owners. This uses
  the existing graph maintenance-occurrence facility, and admits only owners
  already reached by ordinary delivered graph closure. Executable bijections,
  request signatures, final validation and cold reopening remain unseeded.
  Native connections and Header/operation metadata retain their captured
  namespace. There is no new resolver, ownership registry or sidecar contract.

Exact R3b boundaries:

| Source/route | Disposition and reason |
| --- | --- |
| Reusable Path Item reached from captured Paths, including several routes and foreign-only consumers | Representable contents use native referenced fragments and the existing route/owner conversions. Child-only references do not establish a parent route use. |
| Independently unused Path Item targeting Swagger | `migration.path-item.unused-owner`, **target representation**. Swagger's only Path Item positions are endpoint keys and their reference targets. Its reusable categories have no inactive Path Item slot. An unattached fragment loses the native role; a Schema annotation loses field interpretation; a new route/Callback invents API semantics. The source remains intact and no output is published. |
| Reusable Media Type with captured content-key occurrences | Occurrences lower independently through established conversions; neutral schema/Header owners and Example/literal history remain separate. `migration.components.mediaTypes` is no longer the occurrence-materialization implementation gap. |
| Independently unbound reusable Media Type targeting Swagger | `migration.media.unbound-owner`, **target representation**. Swagger has neither a Media Type Object nor its reference slots. Response examples require actual MIME keys; a schema alone cannot retain the independent media envelope or Encoding applicability. A placeholder cannot establish authored media semantics. The source remains intact and no output is published. |
| 3.2 → 3.1 → 3.0, or 3.1 → 3.0 | Standard inactive holders retain typed children and add no executable operations or negotiation choices. All actual bound media keys survive. |
| A separately delivered 3.0 Callback holder subsequently reviewed for Swagger | The input now declares an independent standard Callback, for which Swagger has no representation: `migration.components.callbacks`, **target representation**. A later review has no hidden provenance contract authorizing deletion of that authored wrapper. This does not block the direct representable Path Item route to Swagger; generated temporary native holders in one review still use the existing release mechanism. |
| Missing captures, unresolved resources or no established codec/part-shape certificate | Existing source-incomplete/unavailable-proof findings remain distinct from the target restrictions above. General named Example/serialization, advanced Encoding, XML and discriminator work remains in later bounded R3 assignments. |

Prepared regressions, **not executed**:

| Layer | Coverage |
| --- | --- |
| Engine `test_migration_object_uses.cjs` | Published 3.2 patches in YAML/JSON; several routes, direct/chained media and Path Item references, independent Operation connections, itemSchema, exact examples, source/target request signatures and cold schema behavior. |
| Engine `test_migration_document_owners.cjs`, `test_migration_overlapping_containers.cjs` | Foreign-only consumers; operationId identity; identified/anchored schemas, independent literal/schema consumers and no duplicated schema resources. |
| Engine `test_migration_entry_routes.cjs` | Mixed 3.0/3.1/3.2 entries; unused owners, unused alias chains and child-only consumers; precise located restrictions and empty publication outputs. |
| Engine `test_migration_swagger_media.cjs`, `test_migration_external_examples.cjs` | Distinct request/response/Parameter/Header contexts; chained 3.x holders; inactive placeholder controls; captured external bytes, missing bytes, exact-byte refusal and independent child references. |
| Core `migration_object_uses_test.dart`, `migration_external_examples_test.dart` | Actual HTTP before/after publication, cross-file definitions, unsaved buffers, YAML aliases, repeated review identity, cancellation, source/example staleness, destination races, injected publication failure, deletion of originals, relocated cold opening, CLI review/apply/check and unused-owner refusals. |
| Native `migration_external_examples_review_test.dart` | Reusable 3.2 parents through the actual review/publication flow, captured external bytes, unsaved/stale inputs, and unused owner findings with publication disabled. |
| CLI/preflight and producer admission | Existing shared consumers expose the precise findings. Packaged preflight fixtures cover bound/unused reusable owners, external bytes and unpublished outcomes. Producer 94 joins the obsolete-package controls in Core and preflight. |

The six engine suites remain registered in `tools/build_engine.sh`; existing
Core/native test discovery and the preflight suite include these extensions.
Shared fixtures are `migration_b05_r3b_fixture.cjs` and
`packages/busyapi_core/test/migration_r3b_fixture.dart`.

Production files changed: Engine `migration.ts`, `migration_downgrade.ts`,
`migration_media_objects.ts`, new `migration_reusable_targets.ts`; Core
`packages/busyapi_core/lib/src/migration.dart`; preflight
`tools/native_migration_preflight.py`. Native review and CLI continue to consume
the shared production result; no parallel conversion implementation was added.
Other test edits synchronize positive producer assertions without removing
existing regression or obsolete-producer protections.

Migration producer/admission/preflight are **95**; **94** is obsolete.
Schema-example projection **3**, evaluator **1.18.0+60**, graph **9**, response
mock **5**, parameter mock **4** and sample producer **4** are unchanged.
Bundles remain unbuilt and do not qualify producer 95.

**Actual verification:** normative specification consultation, manual source and
registration inspection, Git state and diff/whitespace review only. No tests,
compilers, analyzers, builds, code generation, CI, graphical workloads,
packaging or performance checks were run. The execution hold remains active;
Snapcraft remains skipped. The installed official Flutter SDK, dependencies
and third-party software were not changed. Source completion is not runtime
acceptance and does not complete B05-R3 or B05.

**Next assignment: B05-R3c — Whole-query and finite cookie-style parameter
lowering.** Advanced Encoding and broader Example/XML/discriminator work remain
for subsequent bounded R3 assignments before B05-R4 reconciliation.

## B05-R3a: Operation paths and saved Server selections

**B05-R3a is source-complete, unverified within W3.09. B05-R3 remains
partially implemented, unverified.** This bounded continuation starts at
`ad9d4381e89d505285269d3d5e911127f73f0c94` in the primary
`release/v0.1.0` checkout. It preserves the earlier implementation baseline;
B05-R3b is now recorded above; B05-R4 has not begun.

The normative Swagger 2.0 Paths/host/basePath/schemes clauses and OpenAPI
3.0.4, 3.1.2 and 3.2.1 Server inheritance, relative URL and Path Templating
clauses govern this conversion. Paths append to expanded Server paths; they
are never resolved as relative URI references or replaced by text search.

Implemented source changes:

- Server lowering captures each effective operation context before conversion.
  It proves a common authority, including protocol-default ports, and chooses
  one shared Swagger base. Root Servers overridden everywhere retain their
  authored history without constraining unrelated effective targets. A common
  effective base keeps authored routes; otherwise its path becomes an opaque
  prefix in each route under `/`. Operation schemes retain the exact supported
  alternatives and their initial default, without a host/path cross product.
- Whole Path Items use CST key relocation where possible. Split and merged
  routes bind only visible, unoverridden inherited parameters locally before
  operations meet. Existing allocator reservations retain referenced Path Items
  or referenced descendants in neutral material fragments. Terminal repairs
  use converted child coordinates, including bodies already moved to Swagger
  parameters. They do not infer targets from old pointer suffixes. Template
  names, encoded segments, methods, operationIds, bodies, security, exact
  examples/extensions, aliases and independent literal owners retain their
  existing graph/CST relations. Comments from split containers are retained.
- Route planning checks method collisions, equivalent template hierarchies,
  encoded spellings and crossing template patterns, including partial-segment
  templates. Target incompatibilities are located refusals before publication.
  Existing active Link/Callback target restrictions remain in force; relocation
  does not invent their missing Swagger representation.
- Operation invariants now require a bijection through both captured Operation
  and Path Item ownership. They reject lost, additional, duplicated or replaced
  occurrences and changed methods/operationIds. Request profiles compare each
  paired operation's exhaustive effective URL choices and default, serialization,
  body/media, responses and security. Unbounded native templates retain their
  existing template/domain proof. Sorting equal-looking operations cannot
  authorize exchanging their identities.
- Saved Server ordinals are projected by effective request URL and captured
  operation identity. Equivalent choices may collapse; invalid ordinals and
  substitutions retain invalid execution guards. Unchanged native variable
  contexts keep their original invalid selection syntax. Integer-only saved
  selector behavior is checked independently of exact mathematical-number
  equality, so decimal/exponent settings cannot become active integers.
- The existing captured configuration and exact manifest publication now retain
  saved cases and unrelated top-level configuration, as well as environments.
  Environment defaults use portable named-entry/method/path keys. Case Server
  overrides can select an index by environment. Occurrence selectors become
  portable entry-scoped selectors; ignored method/path hints cannot replace the
  originally selected operation. Unique case owners are scoped to the delivered
  entry, and a final shared proof checks resolved and unresolved case selection
  in every captured entry. No credential values enter API descriptions.
- Explicit environment base URLs remain unchanged when their appended route
  remains equivalent. A literal suffix may be factored into a reviewed base-URL
  change only when captured substitutions prove the same full effective URL
  and authority/query/fragment remain unchanged. Authentication bindings, TLS,
  environment identities and unrelated fields use the existing exact comparison
  and publication checks. Every changed configuration leaf has an exact
  before/after projection record in Core, native review, CLI JSON/text and
  publication metadata. Preflight requires bounded projection records too.

Exact R3a refusals retained:

| Boundary | Classification |
| --- | --- |
| Effective authorities that cannot share one Swagger host, or alternatives of one operation requiring different route keys | Target representation; no alternative or method is silently discarded. |
| Colliding path/methods, conflicting template names, ambiguous crossing route ownership or incompatible Path Item extensions on a merged route | Target representation. |
| One shared saved case requiring incompatible target paths/indexes across entries, or a shared environment base URL requiring incompatible factors | Target configuration representation; the final identity/selection proof refuses the whole review. |
| An explicit override for which no append-only factor preserves the captured target | Target representation; an unproved substitution/factor is distinguished as unavailable evidence. |
| Unbounded Server-variable domains, execution-environment interpolation inside a lowered Server URL, unavailable material/retrieval ownership, or bounded-proof exhaustion | Unavailable proof; these are not claims that every such source is impossible. |

Prepared regressions, **not executed**:

| Layer | Registered coverage |
| --- | --- |
| Engine `test_migration_default_servers.cjs` | Published patch versions in YAML/JSON; root/Path Item/operation inheritance; method splitting and merging; templates/encoded segments; schemes, bodies and Basic security; default/ordinal/variable projections; invalid selection/entry controls; override factoring and exact target refusals. |
| Engine `test_migration_entry_routes.cjs` | Mixed entries, captured retrieval aliases and external Path Items; negative identity, method, URL, body, loss and duplication controls. |
| Engine `test_migration_object_uses.cjs` | A reference follows a body schema through body conversion, neutral owner allocation and route splitting; cold graph/request/schema evaluation controls. |
| Core `migration_default_server_test.dart` | Actual HTTP methods, encoded URLs, bodies and Basic credentials; saved cases, secure environment defaults, exact configuration; unsaved input, repeat identity, cancellation, destination races, controlled publication failure, stale configuration, source deletion, directory relocation and CLI credential refusal. |
| Core `migration_object_uses_test.dart` | Actual HTTP through external/aliased Path Items before and after split-route publication and cold reopening. |
| Core `migration_exact_configuration_test.dart` | Missing/unrelated projection rejection, saved integer-selector activation and obsolete producer 93, alongside existing exact-number/authentication/TLS controls. |
| Native `server_default_migration_review_test.dart` | Reviewed method splitting and ordinal projection, separate publication, unchanged originals and cold opening. |
| CLI/preflight | Existing CLI consumers expose the shared records; packaged preview fixtures include saved Server selections and different method base paths. Missing/malformed/unrelated records and producer 93 remain negative controls. |

Existing Engine gate registrations and Core/native test discovery include these
extensions; no parallel test system is introduced. Other regression edits only
synchronize current producer assertions.

Migration producer/admission/preflight are **94**; producer **93** is obsolete.
Schema-example projection **3**, evaluator **1.18.0+60**, graph **9**, response
mock **5**, parameter mock **4** and sample producer **4** are unchanged. Bundles
remain unbuilt and do not qualify producer 94.

Production files changed:

- Engine: `migration.ts`, `migration_servers.ts`, new
  `migration_server_routes.ts` and `migration_server_configuration.ts`,
  `migration_downgrade.ts`, `migration_invariants.ts`,
  `migration_schema_owners.ts`, `security_configuration.ts`.
- Core: `lib/src/migration.dart`, `lib/src/execution.dart`,
  `lib/src/request.dart`, `lib/src/contract_test.dart`.
- Native: `lib/src/workspace/migration_review.dart`,
  `lib/src/workspace/request_run.dart`; CLI: Core `bin/busyapi.dart`;
  preflight: `tools/native_migration_preflight.py`.

**Actual verification:** normative specification consultation, manual source
inspection, Git state and diff/whitespace review only. Tests, compilers,
analyzers, builds, code generation, CI, graphical workloads, packaging and
performance checks were not run. The execution hold remains active; Snapcraft
remains skipped. The official installed Flutter SDK, dependencies and third-party
software were not modified. Source completion does not establish runtime
acceptance or complete B05-R3.

**Historical next assignment: B05-R3b**, now recorded above. Subsequent R3 work must address
querystring/cookie serialization, advanced Encoding, Example, XML and
discriminator cases before B05-R4 reconciliation. None was begun here.

## B05-R3: Server, security and newer-version object migration

**B05-R3 is partially implemented, unverified. It is not source-complete.**
Work started at `cad713af880763d88bf247f971c3a193d45c7c09` in the primary
`release/v0.1.0` checkout. This section supersedes historical statements that
R3 has not begun. A01–A03, B01–B04 and B05-R1/R2 remain the implementation
baseline. B05 remains incomplete. **B05-R4 has not begun.** The implementation
gaps below must not be treated as target impossibilities or closed by the
execution hold.

The versioned normative authorities in this register govern the changes,
particularly Server, Path Item, Security Scheme, OAuth Flows, Security
Requirement, Components, Media Type, Encoding, Example, Tag, XML and
Discriminator clauses. Swagger has protocol alternatives and operation-level
schemes; it has neither independent operation hosts nor the modern authentication
and invocation categories listed under target restrictions below.

Implemented source changes:

- Exhaustive Server-variable substitution reuses `finiteServerVariableValues`,
  retains 3.0 defaults outside the recommended enum, binds repeated variable
  names once and treats enum strings as opaque substitutions. Defaults are
  considered first. Equivalent choices collapse to one Swagger host/basePath
  with all protocol alternatives; inherited operation protocols become local
  schemes. Common-authority proof handles protocol-default port elision.
  Relative URLs resolve against their captured retrieval URI, independently
  of `$self`. Local-file retrievals retain the equivalent absent-host/schemes
  representation; they do not become invented HTTP origins. Server and variable
  descriptions retain standard rendered documentation owners and authored
  history through the common allocator.
- Shared-operation ownership now captures effective Server context, including
  root inheritance and the implicit default. Moved native operation holders
  retain that context. Server default-enum repairs visit all captured entries
  and surviving native variable owners. Request invariants compare exhaustive
  effective URL sets and their initial default, while unbounded templates keep
  their template/variable proof. Ordered security invariants are unchanged.
- Existing URI/component security binding, configuration, role and multi-flow
  specialization mechanisms remain shared. Inactive 3.2 security deprecation
  retains authored history; active deprecation, metadata discovery and device
  grants receive located target restrictions. Mutual TLS lowering to 3.0 is
  rejected explicitly. API-key, Basic, OAuth and applicable modern security
  representations continue through their established conversions; no weaker
  scheme substitutes for unsupported authentication.
- The general newer-field refusal is replaced by version-specific handling.
  Empty additional-operation, Webhook, Link and Callback maps retain inactive
  history. Required empty Paths maps are materialized for component-only roots
  targeting older families. Redundant Tag/Info summaries retain authored values
  without renaming identities. XML element/attribute and array wrapping node
  types lower when their modeled domains establish equivalence; inactive XML
  instructions retain history. Finite required string discriminants can lower
  fallback dispatch to explicit mappings without adding validation assertions.
  Component-name precedence is checked across captured entries; the fallback
  connection survives in an unreachable ordinary mapping entry and through the
  discriminator/container role transition on subsequent stages.
- Known sequential media `itemSchema` constraints become whole-content array
  item constraints. Existing whole-content constraints retain independent
  owners. Empty/default and proved inapplicable positional/nested encoding
  instructions retain history, with Header/schema owners preserved separately.
  Active unproved part instructions are never treated as ignored metadata.
- Older Media Type slots materialize referenced envelopes while retaining
  independent references to schemas, named Examples and Headers. Reusable Media
  Types use unused standard Response content holders in 3.1/3.0; reusable Path
  Items use unused Callback holders in 3.0. Used Path Items can retain native
  Swagger fragment owners through the existing allocator. These placements
  add no executable route or callback invocation. Link operation connections,
  runtime expressions and actual Callback declarations continue unchanged
  where their target family supports them.
- JSON/plain-text `dataValue` and `serializedValue` representations lower to
  older Example values when all captured consumers agree. Paired values require
  exact data and byte agreement; external bytes use the existing approved
  capture. Simple ASCII string Header examples have an explicit equality
  certificate. Original serialized strings retain literal owners. Later native
  conversions recognize allocator-owned retained values instead of mutating
  historical payloads as though their old roles remained active.

Known remaining R3 implementation/proof gaps:

| Gap | Current boundary |
| --- | --- |
| Different operation base paths under one compatible authority | Implemented in B05-R3a above. Multiple paths within one operation's alternatives still retain a target restriction. |
| Saved Server selections and environment coupling | Reviewed projections are implemented in B05-R3a above. Incompatible shared selectors/factors and unproved lowered execution-environment interpolation retain the exact boundaries recorded there. |
| Independently unused reusable Path Items targeting Swagger | R3b above establishes `migration.path-item.unused-owner` as a final-target restriction from the available standard native ownership positions. Referenced uses and foreign-only consumers retain common fragment ownership. |
| Reusable Media Type categories targeting Swagger | R3b above completes established occurrence/child-owner conversion; independently unbound definitions retain the precise `migration.media.unbound-owner` final-target restriction. |
| Whole-query parameters | R3c-1/2/3 above are source-complete, unverified: finite identity/extraction/factorization, grouped presence, actual codec comparisons, raw/structured saved projections, examples and shared ownership are implemented. Precise target restrictions and unavailable-evidence cases remain as reconciled above. |
| Positional/nested multipart and response part instructions | Non-default instructions still need complete shape-specific conversion, including any equivalent older Schema annotations; current unavailable-proof/target boundaries do not establish that every such source is impossible. |
| General newer Example serialization | Other parameter/Header serializations, non-JSON/plain-text codecs and unbound reusable examples still lack the required equality/ownership certificates. Simple string Header, JSON and plain-text conversions do not close this matrix. |
| Other newer parameter/XML/fallback specializations | R3c above completes established finite query/cookie projections and their examples/configuration, unverified. Mixed XML domains/reference-forwarding cases and fallback relationships outside the established required finite-string certificate remain unreconciled. |
| Combined R3 regression coverage | New coverage is prepared below, but the complete requested Engine/Core/native/CLI and transaction matrix is not yet prepared for every remaining conversion. |

Established target restrictions include distinct authorities that one Swagger
host cannot preserve; distinct Server alternatives that cannot retain one
operation's choices in the target; unsupported HTTP methods with exact authored
capitalization; non-OAuth roles in restricted families; cookie API keys and
non-Basic HTTP/OpenID Connect/mutual TLS authentication in Swagger; distinct
OAuth refresh endpoints; unsupported discovery/device grants; active newer
deprecation or independently named Server labels without a target field; active
Tag kind/parent/display-summary relationships without an equivalent older
field; distinct XML text/CDATA nodes; and active Links, Callbacks and Webhooks
where the target has no corresponding invocation/connection representation.
No proprietary extension implements one of these missing categories.

Unavailable evidence remains distinct: exhaustive variable domains or bounded
choice proofs, actual media/part shapes, schema-ready versus wire example
equality, approved external bytes, finite discriminator domains and consistent
implicit namespaces, and an established license URL for a newer SPDX identifier.
Preserved source fields are not evidence that their target behavior is equivalent.

Prepared regressions, all **unexecuted**:

| Concern | Existing registered suites extended |
| --- | --- |
| Published declarations, YAML/JSON, multiple schemes, defaults, inheritance, equivalent choices, default ports, relative/local retrievals and distinct/unbounded negative controls | Engine `test_migration_default_servers.cjs`; Core `migration_default_server_test.dart`; native `server_default_migration_review_test.dart` |
| Cross-file media/Path Item ownership, Links, actual Callback reachability, runtime expressions, Tag/XML/fallback metadata, examples, item constraints and source/cold runtime validation | Engine `test_migration_object_uses.cjs` |
| Core request method, URL, content type, body and response bytes; unsaved inputs, repeat review, cancellation, stale review, destination races, controlled publication failure, deletion of originals, relocation and installed CLI checking | Core `migration_object_uses_test.dart` |
| Ordered AND/OR/anonymous and duplicate security requirements, inactive deprecation, target authentication/grant restrictions and credential behavior | Engine `test_migration_security.cjs`; Core `migration_security_test.dart`; native `migration_review_test.dart` |
| Exact unsupported methods and querystring proof boundaries | Engine `test_migration_entry_routes.cjs`, `test_migration.cjs` |
| Packaged positive Server/media preview, distinct-target refusal and obsolete producer rejection | `tools/test_native_migration_preflight.py`, Core `migration_exact_configuration_test.dart` |

The existing engine gate already registers the extended suites. Core/native
discovery and packaged-preflight registration remain unchanged. Other touched
regression sources synchronize their producer assertions; those edits alone
do not supply new behavioral coverage.

Migration producer is **93**, synchronized across Engine, Core admission,
preflight, native fixture and CLI-facing expectations. Producer 92 is retained
as an obsolete negative control. Schema-example projection **3**, evaluator
**1.18.0+60**, graph **9** and the existing mock/sample producers are unchanged.
Bundles remain unbuilt and do not qualify producer 93.

Production files: Engine `migration.ts`, `migration_documents.ts`,
`migration_downgrade.ts`, `migration_servers.ts`, `server_semantics.ts`,
`migration_security.ts`, `migration_operation.ts`,
`migration_operation_contexts.ts`, `migration_invariants.ts`,
`migration_schema_owners.ts`, `migration_schema_uses.ts`, and new
`migration_newer_objects.ts`, `migration_media_objects.ts`,
`migration_example_versions.ts`; Core `lib/src/migration.dart`; and
`tools/native_migration_preflight.py`. Native and CLI production consumers
continue to use the shared review/publication protocol.

**Actual verification:** official specification consultation, manual source
inspection (including the installed Dart URI path-normalization implementation),
Git state and diff/whitespace review only. No compiler, analyzer, test, build,
generation, CI, graphical/native workload, packaging or performance check ran.
The official Flutter SDK and third-party software were not modified. The
execution hold remains active; Snapcraft remains skipped. Local implementation
commits do not establish source completion or runtime acceptance. This historical R3 baseline does not authorize R4 or move remaining R3 gaps into a completed bucket; the current bounded handoff is recorded in B05-R3b above.

## B05-R2: parameter, body, response, example and reusable-object conversion

**B05-R2 is source-complete, unverified within W3.08.** Work started at
`47f5f621c17f8710e1876185fb501d4049cf24c7` in the primary
`release/v0.1.0` checkout. This section supersedes the older statements that R2
has not begun and that examples without schemas need an unspecified
implementation. It preserves A01–A03, B01–B04 and B05-R1. **B05-R3 has not begun.**
No known established representable R2 mapping is intentionally deferred.
Source completion does not establish runtime acceptance.

The normative authorities remain [Swagger 2.0](https://spec.openapis.org/oas/v2.0.html),
[OpenAPI 3.0.4](https://spec.openapis.org/oas/v3.0.4.html),
[3.1.2](https://spec.openapis.org/oas/v3.1.2.html) and
[3.2.1](https://spec.openapis.org/oas/v3.2.1.html). Their Parameter, Header,
Request Body, Response, Media Type, Encoding, Example and Components clauses
govern the mappings below; informational schemas do not override those clauses.

`migration_object_metadata.ts` separates metadata proof from flat-schema
materialization. Inactive deprecation, location-inapplicable fields and proved
inactive reserved expansion retain their authored values through the common
allocator. Boolean and finite string/array domains can establish inactive
reserved expansion; a constrained language without that certificate receives
an unavailable-proof refusal. Active deprecation and parameter/Header examples
are never emitted as unsupported Swagger fields. Equivalent text string and
JSON numeric/Boolean content parameters reuse B02's concrete Items compiler.
Referenced declarations retain their ordinary targets and independently owned
schemas. Empty examples overrides can suppress schema candidates on a private
assertion variant while the original schema and its examples remain intact.

Body descriptions and requiredness retain their standard body Parameter fields.
Form group descriptions retain a rendered standard Schema Object owner, with
the existing Markdown destination proof. The form converter expands every
captured occurrence, including references to an inline body; the original group
and intermediate aliases retain history. Generated field references can recover
their captured neutral schema owner through the existing fixed-reference path.
Existing B04 field, binary, cardinality, presence and Encoding proofs remain in
force. Empty form examples are retired only after their fallback effect is
preserved. Active whole-form wire examples still need a target owner.

JSON data examples, and text examples with a proved plain string interpretation,
can become an occurrence-specific body schema annotation. Each media projection
must reproduce the original bytes. One data value can therefore support distinct
JSON/text wire representations, including separately captured payload resources.
Private assertion variants suppress overridden schema examples across fixed
same-instance references and conjunctions; property/item schemas and original
resource identities remain neutral. Recursive graphs use memoized common
allocator variants. Example normalization precedes the common-media-schema
proof, so overridden examples do not defeat an otherwise equal assertion proof.
No wire example becomes a schema annotation solely because its field is a string.

Swagger responses without `schema` remain bodyless. Empty examples maps can be
retained as history; nonempty authored examples keep the located standard-target
restriction because a 3.x Media Type Object would activate content. In the other
direction, a schema-less Media Type Object retains body presence through an
unconstrained Swagger schema. Named examples collapse only when their exact
projected payloads agree. Names, summaries, descriptions, aliases, comments and
original values retain separate historical/documentation owners. Distinct
payloads receive a target restriction without an arbitrary selection decision.
Unique media-specific schema candidates can populate Swagger response examples;
empty overrides suppress schema fallback. Canonical Swagger response projection
now uses the existing schema-candidate selector for data schemas, with explicit
media examples taking precedence. File annotations do not acquire an invented
JSON data instance.

External examples use `MigrationExamples`' existing approved captures. Standard
literal materialization checks exact entity bytes, honors the declared text
charset and retains source-locator provenance. The same capture owner proves
materialized bytes in final and cold graphs. Surviving native external locators
continue through the existing copy/mapping/publication path. No additional
loader, schema evaluator or semantic ownership registry was introduced.

Reusable Parameters and Request Bodies allocate collision-free names in the
standard Swagger Parameter map. Responses retain standard reusable owners and
consumer media. Headers use occurrence materialization and the existing unused
Response.headers holders. Examples use exact literal materialization plus
retained source history/documentation rather than an invented Swagger component
category. Ignored Content-Type/Encoding Headers preserve independently consumed
schemas; an independently referenced Header keeps its native conversion proof.
Archived native locators are excluded from typed reference repair. The common
allocator also releases its fresh layout placeholder before CST copy/move fills
the material slot; reservations, identity and reference repair remain shared.

OpenAPI 3.2 response Encoding applicability directly affects this R2 invariant.
Older ignored response encodings retain neutral owners before a 3.2 target can
activate them. Lowering 3.2 accepts established redundant defaults, refuses
active part instructions without an older standard owner and distinguishes a
missing part-shape proof. This narrow safeguard does not start R3's general
newer-object, server, Link, callback or security conversions.

Parameter/Header invariants now include independently reusable owners, location,
requiredness, deprecation, applicable empty-value behavior and serialization.
Operation invariants compare selected example bytes alongside body applicability,
status and media. B05-R1 entry ownership, A01–A03 reference/resource proofs, exact
payload checks and Core's immutable capture/atomic publication remain authoritative.
Native review and CLI continue consuming the shared plan and Core publication.

Prepared regressions, all **unexecuted**:

| Concern | Existing registered production suites |
| --- | --- |
| Published source declarations, YAML/JSON, schema/content parameters, inactive and active metadata, requiredness, ignored Headers and negative controls | `test_migration.cjs`, `test_migration_swagger_media.cjs` |
| Reusable name collisions, reference chains, mixed entries, shared recursive schemas, exact numbers, common and distinct examples, schema-less media, empty overrides and response Encoding activation | `test_migration_swagger_media.cjs`, `test_migration_object_uses.cjs`, with `migration_b05_r2_fixture.cjs` |
| No-content status/media behavior and empty/nonempty legacy examples | `test_migration_bodyless_responses.cjs`, Core `migration_bodyless_response_test.dart` |
| Form descriptions, inline reusable bodies, alias history, empty overrides and existing actual multipart/form bytes and refusal controls | `test_migration_form_downgrade.cjs`, Core `migration_form_downgrade_test.dart`, `migration_form_cli_test.dart` |
| Captured JSON, declared Latin-1, empty payloads, JSON/text projections, exact byte refusal, unavailable capture and cold reopening | `test_migration_external_examples.cjs`, Core `migration_external_examples_test.dart` |
| Request/response/Header HTTP behavior, examples, unsaved inputs, repeat review, cancellation, stale review, destination races, publication failure, installed CLI review/apply and cold reopening after originals are removed | Core `migration_swagger_media_test.dart`, `migration_external_examples_test.dart` |
| Shared candidate projection and strict representation revision | `test_schema_example_inputs.cjs`, Core `conditional_schema_example_inputs_test.dart` |
| Native review of captured examples and materialized Swagger values, unsaved inputs and stale refusal | `migration_external_examples_review_test.dart`; physical native fixture `tools/test_migration_client.dart` |
| Packaged CLI positive/negative R2 preflight and obsolete producer rejection | `tools/test_native_migration_preflight.py`; Core producer-admission matrices |

The six requested Engine suites and candidate suite retain their registrations
in `tools/build_engine.sh`. Core and native suites retain serial discovery in
`tools/build_linux.sh` and the existing widget runner; packaged preflight retains
its existing CI unittest registration. No execution gate was invoked or replaced.

Remaining refusals are concrete boundaries, not permission to discard metadata:

| Classification | Boundary |
| --- | --- |
| Target restriction | Active Parameter/Header deprecation, required response Header presence, parameter/Header payload examples, JSON string quoting or unsupported parameter locations without a standard flat target owner. |
| Target restriction | Nonempty Swagger examples on a schema-less Response; distinct named payloads per media; differing established request example selections that one body schema cannot preserve; active whole-form examples and active part instructions without a target owner. |
| Target restriction | A captured serialized example whose proposed standard literal changes bytes, or an external reusable Example with no materialized standard occurrence. |
| Unavailable proof | Constrained reserved-expansion languages outside the finite/Boolean certificate; other content decoders or unestablished scalar domains; absent example payload/capture binding, unsupported literal byte encodings, incomplete schema candidate/resource evidence, missing part shapes or exhausted proof budgets. |
| Separately assigned implementation | R3's general newer media/example-value fields, reusable media/Path Item/Link/callback categories, servers and security. Their existing blockers are not relabeled as target impossibility. |

Migration producer is **92**, synchronized across Engine, Core, preflight,
native fixture and CLI-facing expectations. Schema-example projection is **3**,
with strict Core admission. Evaluator **1.18.0+60**, graph **9**, response mock
**5**, parameter mock **4** and sample producer **4** are unchanged.

Production changes: Engine `migration.ts`, `migration_downgrade.ts`,
`migration_object_metadata.ts`, `migration_encoding.ts`, `migration_examples.ts`,
`migration_form_downgrade.ts`, `migration_invariants.ts`,
`migration_media_schema.ts`, `migration_schema_owners.ts`,
`migration_swagger_media.ts`, `schema_examples.ts`, `swagger_operation.ts`;
Core `lib/src/migration.dart`, `lib/src/execution.dart`; and
`tools/native_migration_preflight.py`. Existing native UI and CLI production
consumers remain shared; their fixtures and producer expectations are updated.

**Actual verification:** official specification consultation, manual source
inspection and Git diff/whitespace review only. Tests, compilers, analyzers,
builds, code generation, CI, graphical workloads, packaging and performance
checks were not run. Bundles remain unbuilt and do not qualify producer 92 or
projection 3. The execution hold remains active; Snapcraft remains skipped.
No third-party software or installed Flutter SDK was modified. Runtime
verification remains outstanding; the next assignment is **B05-R3**.

## B05-R1: inherited media and shared-operation migration

**B05-R1 is source-complete, unverified within W3.08.** Work started at
`7aa4080e4166733f7c74590e7470c919693b408d` in the primary
`release/v0.1.0` checkout. This section supersedes the older statements that B05
has not begun. It does not complete B05, establish runtime acceptance, or begin
**B05-R2 — Remaining parameter, request/response, example and reusable-object
conversions**. No known established representable R1 mapping is intentionally
left without an implementation; all prepared regressions remain unexecuted.

The A01–A03 ownership preparation and terminal reference repair remain the
implementation boundary. `migration_operation_contexts.ts` enumerates actual
canonical operation occurrences and independently reached native Operations,
including reusable Path Items and Link operationRef targets. It retains logical
alias pointers and known native method slots. Entry-context differences now
include those operations' media and body applicability, rather than considering
only operations executable from Paths.

Each specialized Swagger Operation binds inherited consumes and produces on
its planning copy before graph recapture. Authored operation overrides, including
explicit empty arrays, retain their CST values until structural conversion.
Request and response media remain independent. Thus a later entry cannot
reinterpret a private operation using another description's global media.
Captured entries and media consumers are processed in stable order. Original
shared operations, unrelated literal consumers and ordinary editor buffers do
not receive these specialized fields.

The common allocator also supplies foreign Swagger native holders through an
unused reusable body Parameter's generated schema annotation. It introduces no
route or schema model name. Only the new holder's actual native containment can
skip redundant literal-role separation; original authored annotations and
independent Schema Object interpretations retain their existing guards. This
lets a modern entry reference a media-specialized foreign Swagger Operation
while its containing Swagger description keeps its own operation and media.
Simple apiKey definitions can use the existing concrete security-alias mapping
in both directions across that boundary. Richer schemes keep their existing
family-specific conversions and refusals.

Copied 3.0 Operations with request bodies retain native method holders even
when their original consumers are only Links or literal aliases. Independently
copied Operations retain effective unoverridden Path Item parameters through
references to the existing Parameter owners; schemas and their identifiers are
not duplicated. Applicable inherited Server declarations retain captured URL
bases through the existing server-template projection. Operation-local overrides
continue to take precedence.

Ignored-body omission still requires the existing explicit
`omit-ignored-body` decision. Omission applies to that logical native occurrence,
including independently referenced operations with known methods; it does not
remove an active alias or another entry's active request body. The original-family
check still prevents composed Swagger conversions from omitting an originally
active Swagger body. A detached 3.0 body without a captured method has an
`unavailable-proof` refusal before holder placement, so a generated holder cannot
invent the decision about its applicability. An inconsistent method binding
after specialization also stops rather than removing an active use.

Swagger media conversion and B04 binary discovery now use the same captured
operation inventory. Structural Parameter, Response and Header conversion uses
all captured entry scopes, including private secondary owners. Reusable body
and response wrappers continue to share separate schema owners. Response
reference chains select only their consumer's media variant; bodyless responses
remain bodyless. Alias-backed schema fields are recognized through semantic CST
lookup. No new binary or form transformation, media registry, resolver or
automatic migration path was introduced.

`MigrationSemanticOrigins` now tracks every Operation through the existing
entry/role relation. The added operation invariant compares request-body
applicability, requiredness, request media and response status/media at all typed
operations, including non-executable references, callbacks and webhooks. Existing
request signatures still prove executable methods, paths, URLs, serialization
and security; static/dynamic connections, schema resources, exact payloads,
discriminators and cold-resource relocation keep their existing proofs.

Core captures unsaved inputs and admits the shared Engine result. Native review
and the independent CLI present those same affected resources and changes;
neither duplicates the operation conversion. Existing decision, cancellation,
stale-review and atomic publication boundaries remain authoritative. Producer
admission is updated in Core and native preflight.

Prepared production-path coverage (all **unexecuted**):

| Concern | Regression source and prepared evidence |
| --- | --- |
| Global media, operation overrides, explicit empty overrides, distinct request/response requirements, shared recursive body/response schemas, exact values, per-entry security and deterministic discovery | `test_migration_swagger_media.cjs`, with `migration_operation_contexts_fixture.cjs`; all published target 3.x patch declarations in YAML/JSON. Source and target execution plans and positive/negative schema outcomes are compared. |
| Empty global media versus a named response media set | `test_migration_entry_routes.cjs`; separate assertions for each entry's request and response media. |
| Shared body applicability across 3.0/3.1 entries and GET/POST aliases, reusable bodies, ignored-body decisions and known-method referenced literal Operations | `test_migration_ignored_swagger_body.cjs`; Swagger and modern targets, preserved literal data, distinct operation identities, reversed discovery, explicit 3.0 target restriction and a located unavailable-method proof refusal. Existing stale-decision, unsupported-method and missing-resource negative controls remain. |
| Foreign Swagger operationRef, inherited parameters, named security and independent entry media without adding an executable route | `test_migration_object_uses.cjs`; independently retained legacy operation, private referenced target, repaired request-body/parameter references and concrete cross-family apiKey bindings. |
| Different inherited response media without activating content | `test_migration_bodyless_responses.cjs`; shared reusable schema-less responses and bodyless status definitions. Existing examples-without-schema refusal remains. |
| Core and installed CLI behavior and transactions | `migration_swagger_media_test.dart`; YAML/JSON media and mixed-family applicability journeys compare actual HTTP methods, URLs, selected media, absent/active request bodies and exact numeric entity/response bytes. Both entries are captured, with an unsaved shared buffer; repeat review, explicit decisions, cancellation, publication-boundary destination conflict, stale buffer refusal, original preservation and cold reopening after original resources are removed are prepared. |
| Native review of specialized operations and generated resources | Existing `migration_review_test.dart` coordinated Swagger cases now share an operation with different inherited request/response media, inspect the affected-resource selector and retain a shared-resource stale-review control. Existing ignored-body decision, mixed-entry and binary review cases remain registered. |
| Packaged preview and obsolete producer rejection | `tools/test_native_migration_preflight.py` adds actual two-entry Swagger media previews without publication; producer 90 joins the previous rejection matrix and Core's YAML-ownership/exact-configuration admission controls. |

The five Engine suites were already registered by `tools/build_engine.sh`.
The changed Core suite (including installed CLI subprocesses), native widget
suite and packaged preflight suite retain their existing serial/native/CI
registrations. No execution gate was invoked or replaced. Existing A01–A03 and
B01–B04 recursion, resource/dialect, independent-schema, binary/form, literal,
transaction and negative controls remain in place.

Remaining R1 refusals describe concrete boundaries: an active source body cannot
become a body ignored by a 3.0 target; Swagger cannot acquire unsupported HTTP
method slots; missing source resources or invalid source stop capture; absent or
inconsistent method evidence stops applicability proof. Existing B04 media,
binary, encoding and schema-equivalence restrictions remain precise. These are
not permission to omit active bodies, change methods, activate ignored bodies or
relax source validation. B05-R2 conversions remain outside this assignment.

Migration producer is **91**, synchronized across Engine, Core, native preflight
and CLI-facing expectations. Evaluator **1.18.0+60**, graph **9**, response mock
**5**, parameter mock **4**, and sample producer **4** are unchanged.

Production source changes are in Engine `migration.ts`, `migration_documents.ts`,
`migration_operation_contexts.ts`, `migration_operation.ts`,
`migration_schema_uses.ts`, `migration_schema_owners.ts`,
`migration_swagger.ts`, `migration_swagger_media.ts`, `migration_binary.ts`,
`migration_invariants.ts`; Core `packages/busyapi_core/lib/src/migration.dart`;
and `tools/native_migration_preflight.py`. Existing owner-reference repair,
source/CST editing, native UI and CLI consumers remain the shared integration
paths. Other changed migration suites synchronize their producer expectation.

**Actual verification:** normative specification consultation, manual source
inspection and Git diff/whitespace review only. No tests, compilers, analyzers,
builds, generation, CI, graphical workloads, packaging or performance checks
were run. Generated bundles remain unbuilt and do not qualify producer 91.
The execution hold remains active; Snapcraft stays skipped. No third-party
software or official Flutter installation was modified. Source completion is
not runtime verification or completion of the entire B05 work package.

## B04-R3: final integration and transaction reconciliation

**B04 is source-complete, unverified for W3.07.** This reconciliation started at
`66836164ea537572eab23f9cc022a7c3791f63ea` in the primary
`release/v0.1.0` checkout. This status supersedes the initial B04 outstanding-work
list and the individually scoped R1/R2 handoffs below. It is a source review and
prepared-regression conclusion; execution qualification remains outstanding.
No known established representable B04 mapping remains intentionally deferred.
B05 has not begun.

The existing sequence remains authoritative: capture every entry and its typed
uses; allocate independent role/resource/binary owners; prepare exact binary
certificates; project raw/literal predicates; lower schema vocabulary and media/
forms; repair captured connections; validate each stage; relocate and prove the
output; review and atomically publish through Core. Native and the independent
CLI consume that same plan. Source editing, ordinary saving and Undo/Redo never
invoke migration. No additional semantic pipeline or resource resolver was added.

Reconciliation corrected five concrete source gaps:

- `migration_binary_literals.ts` used a JSON string-node test for containing
  nonempty byte literals. YAML uses scalar CST nodes. It now tests the semantic
  string value, so YAML cannot turn an unproved nonempty byte equality into a
  false assertion and publish a changed language.
- `migration_binary.ts` prepared certificates from only the primary entry's
  scopes although conversion visits all captured entries. Preparation now uses
  the same `migrationScopes(contexts)` closure. Private constrained consumers in
  a secondary API receive proofs even when the primary API references only an
  unrelated schema in that document.
- Swagger response file `format` metadata now retains a neutral owner before
  conversion. In particular, `format: byte` on a file cannot enter the encoded
  string branch or silently disappear when the target introduces raw binary.
  The direct Swagger/Core/preflight file journeys cover this case.
- `migration_form_files.ts` now intersects exact cardinality bounds across fixed
  references and positive conjunctions. Redundant wider bounds do not defeat a
  proved one-item file array. Conflicting metadata cannot silently overwrite an
  earlier value. `form_semantics.ts` supplies the corresponding intersected
  transport hints; exact assertion truth remains with the canonical evaluator.
- `migration_media_schema.ts` compares numeric operands using the existing exact
  decimal coefficient/exponent representation. Equivalent numeric and escaped-string spellings, including
  values beyond binary floating-point precision, admit a common media/form
  schema. Both authored CST spellings and unselected owners remain preserved.

R1 predicates remain in the common schema pipeline before R2 media/form
selection. The prepared chained regression migrates one raw constraint
certificate through modern media ownership and then Swagger media selection,
while an independent JSON consumer retains its own literal/string predicates.
Mixed-entry, same-instance recursion, ordinary property recursion, fixed static
and dynamic references, independent descendants and cross-file aliases continue
through the shared ownership and reference proofs. No recursion is expanded into
an arbitrary finite approximation.

The protocol now distinguishes `unavailable-proof` from `implementation`.
Engine emission and Core admission/typed `MigrationProblemReason.unavailableProof`
agree. Native review displays the shared located diagnostic and the CLI retains
its reason in JSON. Missing a certificate does not establish general target
impossibility. The following is the reconciled refusal register:

| Cause | Exact boundary and production owner |
| --- | --- |
| Target restriction | Nonempty raw byte contents that require equality/pattern distinctions absent from the target raw vocabulary; `migration_binary_constraints.ts::rawConstraintReason`. A containing contradiction or redundant predicate can eliminate this requirement only with its own certificate. |
| Unavailable proof | Containing literals without a common exact projection; nonconstant recursive, conditional or Boolean equivalence beyond the exhaustive R1 domain; direction-dependent finite results; `migration_binary_proofs.ts`, `BinaryUses.rawCompatible` and the common owner guards. Nonempty containing equality is refused when that proof is unavailable, rather than assumed false. |
| Unavailable proof | Missing, conflicting or conditional media/encoded-string bindings, incompatible independently interpreted contexts, and unproved dynamic-target equivalence; `migration_binary.ts`, `whole_body_encoding.ts`, the canonical multipart discovery and existing reference/resource proof owners. A concrete Swagger file consumed through a JSON/text decoder instead of arbitrary raw bytes retains its target restriction. |
| Target restriction | Swagger Items(file), file in definitions/type unions/ordinary nested Schema Object positions, duplicate name/in parameters, nested model-valued flat fields, and applicable part media/header/transfer bindings without a Swagger owner; `migration_swagger.ts`, `migration_form_downgrade.ts`, `migration_form_files.ts`. Forbidden file source positions are invalid source and stop source validation, rather than being offered a union conversion. |
| Unavailable proof | No one-file cardinality/assertion/serialization certificate, including conditional alternatives; `materializeSingletonFormFile`. A proved one-item positive intersection is implemented. Wider file repetition has no Items(file) representation; absence of the certificate alone is reported as unavailable proof. |
| Target restriction | Constrained files with genuinely active octet predicates absent from Swagger's file model; conditional form-body presence, object-wide/group rules without a flat owner, incompatible delimiters and active per-part metadata; `migration_form_downgrade.ts`. |
| Unavailable proof | No common media/form schema under every captured raw/data domain, including unresolved comparisons; `commonMediaSchema` / `mediaSchemaIdentity`, `migration_downgrade.ts`. Numerically equivalent exact operands are implemented. Structural inequality alone is not a general proof of logical inequivalence. |
| Target restriction | One Swagger schema cannot express truly incompatible media-selected assertions; operation-wide produces cannot express different nonempty response media sets by status; `migration_downgrade.ts`. |
| Unavailable proof | No exhaustive separator-free language certificate for a separated collection, or no finite fixed form-object materialization certificate; `migration_form_downgrade.ts`, `materializeFormObject`. No unbounded language is sampled. |
| Target restriction | Active non-base64 contentEncoding cannot become legacy byte; active decoded-content-schema bindings have no legacy vocabulary owner; `migration_schema.ts`. Raw inactive content annotations retain neutral owners and do not create a decoder. |
| Unavailable proof | Exhausted binary route/work/literal/evaluation or media/form material/comparison budgets; `migration_binary_proofs.ts`, `migration_binary_containers.ts`, media/form owners and `migration.ts::refused`. Existing R1/R2 numerical limits are unchanged. |
| Source/evidence prerequisite | Invalid native source, unavailable resources or unsupported dialects stop the source validation/capture gate with source-located validation/acquisition findings. They are distinct from a valid document's unsupported conversion; no result has publishable partial outputs. |

`implementation` remains available for actual unfinished mappings elsewhere in
the migration implementation, including the separately assigned B05 work. It is
not used to disguise the bounded B04 binary/media proof refusals listed above.

The complete prepared B04 matrix uses the established suites and production
entry points; every entry below remains **unexecuted**:

| Requirement | Regression sources and evidence prepared |
| --- | --- |
| Raw request/response bytes, exact lengths, base64 whole bodies and multipart parts, JSON-compatible values, empty/non-UTF-8 payloads | Engine `test_migration_binary.cjs`; Core `migration_binary_test.dart` compares source/target positive and negative runtime outcomes and actual HTTP request/response bytes across published YAML/JSON family directions. Encoded multipart publication/reopening now uses the same transaction loop as raw and whole encoded bodies. |
| R1/R2 interaction, media equivalence and independent JSON consumers | Engine binary chained modern→Swagger journey, exact media/form alternative comparisons, and the existing containing/composition/dynamic/annotation-oracle controls; Core `migration_swagger_media_test.dart` adds exact equivalent encoded media, actual HTTP positive/negative comparisons and reopening after removing the original. |
| Swagger file form parameters/responses, mixed fields, proved file arrays and array cardinality | Engine direct-Swagger, form-downgrade and form-media suites; Core form-downgrade and Swagger-media suites. Redundant-bound singleton intersections extend the existing production wire journey. Direct Swagger coverage now evaluates actual raw response instances as well as form requests. |
| References, recursion, external resources, mixed entries and independent owners | Engine binary private-secondary-entry certificate journey plus existing binary/reference/resource/entry suites; Core binary multi-file captures with an independently consumed alias, recursive schema and private secondary API operation; native coordinated review now includes binary consumers in mixed and modern entry projects. |
| Unsaved Source, original preservation, YAML anchors/aliases and exact values | Core binary shared multi-file transaction matrix, existing form/media HTTP publication journeys and native coordinated review. Source buffers and saved originals are compared explicitly. |
| Determinism, review, decisions, stale approval and CLI apply | Engine repeated captures; Core repeated multi-file reviews; binary decision/review tests; installed independent CLI preview/repeat/decision/stale-approval/apply journey followed by cold runtime validation. Existing CLI form publication remains registered. |
| Undo/Redo and stale Source | Core binary transaction matrix invalidates the old review across Undo and Redo; existing source invalidation remains. Native review adds a shared binary-resource edit that disables publication. Migration itself remains a separate-copy operation, outside the editing undo stack. |
| Cancellation, external disk modification, destination conflict, staged failure, atomic multi-file publication | Core binary matrix uses actual `MigrationOutput.publish`, checks the absent destination after private writes, injects cancellation/conflict/failure at the existing pre-publication boundary and checks staging cleanup, all originals and foreign sentinels. Existing form/media publication-race controls remain. This covers staged failure before atomic directory commit, not a fabricated multi-file sequence of visible renames. |
| Cold reopening and retired source resources | Core shared binary and exact encoded-media journeys remove original files before opening/checking the migrated project; the CLI-applied binary project is reopened and evaluated without its original source. Existing portable relocation/resource identity suites remain registered. |
| Negative source/conversion/proof matrix | Engine binary adds unavailable-resource/dialect, invalid-source, competing-dynamic-target and exhausted-binary-budget captures; existing file-position, incompatible alternatives/constraints, missing binding and unsupported encoding cases assert no outputs. Core checks the new typed unavailable-proof refusal and blocks publication. |
| Native preflight and producer admission | `tools/test_native_migration_preflight.py` adds actual packaged B04 multi-resource previews for raw, base64 and Swagger-file representations in both formats; no preview may publish or change a fixture. Producer 89 joins existing obsolete-identity controls in Core and preflight. |

All five required Engine suites are already registered by
`tools/build_engine.sh`. Core suites (including their installed CLI subprocesses)
are discovered by the existing serial Core gate in `tools/build_linux.sh`.
Native `migration_review_test.dart` is included by the existing standard/local
widget gates; the preflight suite is registered in
`.github/workflows/flutter-linux.yml`. No new test framework or execution gate
was introduced, and none of those gates was invoked.

Production changes in this continuation: Engine `form_semantics.ts`,
`migration.ts`, `migration_binary.ts`, `migration_binary_constraints.ts`,
`migration_binary_literals.ts`, `migration_binary_proofs.ts`,
`migration_downgrade.ts`, `migration_form_downgrade.ts`,
`migration_form_files.ts`, `migration_media_schema.ts`, `migration_schema.ts`;
Core `packages/busyapi_core/lib/src/migration.dart`; native preflight
`tools/native_migration_preflight.py`. Existing native UI and CLI production
entry points require no duplicated binary semantic rules.

Migration producer is **90**, synchronized across Engine, Core, native preflight,
CLI-facing regression expectations and obsolete-producer controls. This bump
covers corrected mappings and the additional diagnostic reason. Evaluator
**1.18.0+60**, graph **9**, response mock **5**, parameter mock **4**, and sample
producer **4** are unchanged: canonical schema assertion/byte evaluation and the
producer protocols of those services did not change. Transport hints now reflect
intersected bounds; they are not substitutes for exact evaluator certificates.

**Actual verification:** source inspection and Git diff/whitespace review only.
No tests, compiler, analyzer, build, generation, CI, graphical/native workload,
packaging or performance checks were executed. Generated bundles remain unbuilt
and are not evidence for producer 90. The execution hold remains active;
Snapcraft stays skipped. Third-party software and the official Flutter
installation are unchanged. B04 source completion is not runtime acceptance,
overall BusyAPI SOURCE COMPLETE or ACCEPTED. The next bounded assignment is
**B05 — Remaining API object and media migration**; it was not started here.

## B04-R2: Swagger file/media alternatives and encoded whole bodies

**Source-complete for the established R2 mappings; unverified.** Work started
at `aa3e69386bab8a7d6bcaf98edf1794e8c02ee2b9` on the primary
`release/v0.1.0` checkout. R1's exact literal evaluation and constraint
certificates remain in place. B04 as a whole remains in progress: R3's final
integration/transaction reconciliation and B05 have not begun.

Swagger formData files now retain mixed ordinary fields, original field names,
requiredness, repeated primitive arrays, inherited media and part serialization.
Inactive primitive/array fields on a Swagger file parameter retain literal
owners, so a file's authored maxLength cannot accidentally activate a raw byte
bound in the target. Swagger file responses retain reusable response wrappers
and each operation's effective produces. Wrapper/schema reservations now use
the shared `MigrationSchemaOwners` allocator. File is never emitted into a
definition, an ordinary Schema Object type union, or a Swagger Items Object.

Form downgrade materializes captured fixed references and finite object
conjunctions, then reuses B02's concrete Items Object compiler. Whole schemas,
independently referenced fields/items, and neutral JSON definitions retain their
own schema targets. Flat declarations copy assertion fields without acquiring
those schema identities. Reusable form Request Bodies expand at their actual
operation occurrences; their intermediate reference chains retire after every
use has its parameter binding. A raw file array with proved minItems/maxItems
of one can become one file parameter, including a proved one-position raw tuple. Wider repeated files cannot become
Items(file) or duplicate name/in parameters. Primitive arrays retain multi,
csv, ssv or pipes only with the applicable boundary certificate. Empty part
bytes remain distinct from an omitted required part. Swagger empty-value rules
are projected into 3.x string/item assertions; MIME transfer decoding precedes
the canonical Swagger empty-value check.

Compatible media alternatives use a finite comparison of converted schemas:
fixed references, same-instance conjunctions, exact literal values, unordered
schema maps and enum/required sets. Candidate schemas must agree in every
captured applicable domain, including the legacy octet-string domain at a raw
occurrence. The unselected schemas retain neutral owners. No incompatible
alternatives become a misleading common schema or an invalid type array.
Bodyless response statuses do not acquire content from operation-wide produces.

Form encodings retain authored literal history. Ignored Content-Type Header
Objects and URL-encoded Header Objects retain independently addressed schemas;
separately referenced native Headers use the existing neutral Response.headers
owner and flat Header compiler. Applicable multipart part media and header
constraints are checked before any successful result can be published.

Whole-body representation discovery now shares the canonical fixed
same-instance encoding discovery with MIME parts. A captured explicitly modeled
base64 string can migrate between byte and contentEncoding representations,
including an opaque whole-body occurrence. The decoder projects the wire text
itself as a string; it never base64-decodes or re-encodes that HTTP entity.
JSON/text media retain their own codecs. Raw entity bytes remain decoder-owned
raw instances, including empty and non-UTF-8 bodies. Inactive contentEncoding,
contentSchema, string constraints and nonbinary formats at raw occurrences keep
neutral owners; rejecting JSON type/equality assertions retain their R1
projections. Redundant/contradicting media annotations do not create a decoder.
HTTP Content-Encoding is not used as evidence for schema contentEncoding.

**Remaining representation and evidence refusals:**

- Swagger has no Items(file), nested model-valued flat form field, general
  Encoding Object, or per-part media/header/transfer constraint owner. Constrained
  files without a redundant-constraint certificate retain their located refusal.
  A one-item file mapping requires the captured cardinality/serialization proof;
  degenerate or conditional alternatives cannot borrow that proof.
- One Swagger body/response schema cannot select incompatible assertions by
  media type. Distinct nonempty response media sets by status have no Swagger
  produces equivalent. Missing common-schema certificates are evidence refusals,
  rather than a general impossibility claim about arbitrary logical equivalence.
- Conditional body presence, closed/object-wide form assertions, group metadata
  without a target owner, incompatible collection delimiters, and applicable
  part media/headers retain specific target-representation refusals. Unbounded
  separated string languages without an exhaustive separator-free certificate
  remain evidence refusals. No unsupported nested structure is flattened.
- A whole opaque body without a captured encoded-string binding, competing
  string/structured encodings, unresolved or variable dynamic targets and
  unsupported dialect/resource contexts cannot justify conversion. Legacy byte
  cannot stand for base64url or quoted-printable. Active decoded-content-schema
  bindings still lack a legacy vocabulary equivalent. Swagger file semantics
  cannot be replaced by a modeled JSON/text decoder for arbitrary entity bytes.
- R1's bounded byte-content equality, regex, Boolean/conditional and direction
  proof limitations remain exactly the separate R1 limitations below. R2 adds
  finite material/comparison work limits of 50000 states per proof and 2048 media alternatives, under the
  existing common ownership/resource/edit budgets. Exhaustion refuses a proof.

Production modules changed: `migration_binary.ts`, `migration_swagger.ts`,
`migration_swagger_media.ts`, `migration_downgrade.ts`,
`migration_form_downgrade.ts`, `migration_flat_items.ts`,
`migration_media_schema.ts`, `migration_form_files.ts`, `migration_schema.ts`,
`migration_invariants.ts`, `migration.ts`, `whole_body_encoding.ts`,
`multipart_encoding.ts`, `form_semantics.ts`, `runtime_form.ts`,
`runtime_evaluation.ts`, `schema_evaluation.ts`, Core `migration.dart` /
`project.dart`, and `native_migration_preflight.py`. Ordinary editing and the
shared Core/native/CLI review, capture, cancellation, stale-decision,
publication and reopening transactions keep their existing entry points.
General multipart generation, streaming and mock generation remain outside R2.

Prepared regressions extend the registered engine suites
`test_migration_binary.cjs`, `test_migration_direct_swagger.cjs`,
`test_migration_swagger_media.cjs`, `test_migration_form_downgrade.cjs` and
`test_migration_form_media.cjs`; Core `migration_binary_test.dart`,
`migration_form_downgrade_test.dart` and `migration_swagger_media_test.dart`;
and native `migration_review_test.dart`. They cover JSON/YAML, published family
directions, mixed/shared forms, one-item files, inherited/reusable file responses,
encoded whole bodies, incompatible alternatives, independent schemas, aliases,
captured empty/non-UTF-8 bytes, validation comparisons, actual HTTP byte exchanges,
unsaved review, CLI review, cancellation, stale capture, publication races and
cold reopening. Existing suite/gate entries register the additions; the new
modules are bundled through their production consumers. Other suite edits
synchronize producer admission expectations and obsolete-producer controls.

Migration producer **89**, evaluator **1.18.0+60**, graph role revision **9**,
response mock **5**, parameter mock **4**, sample producer **4**. Evaluator
configuration adds `whole-body-encoded-string-v1` and
`swagger-form-empty-values-v1`; migration producer 88 and evaluator +59 remain
explicit rejection controls. Core, native preflight and CLI admission agree.

**Actual verification:** source inspection and Git whitespace review only.
No tests, compiler, analyzer, build, generation, CI, graphical/native workload,
packaging or performance workload ran. Bundles remain unbuilt under the execution
hold. No third-party software or official Flutter installation was modified.
Snapcraft remains skipped. This is source completion, not runtime acceptance.
The next assignment is B04-R3; it has not been started.

## B04-R1: containing literals and constraint equivalence

**Source-complete for the bounded R1 certificate families; unverified.** This
continuation started at `6381e25a01517fab6c627fc85784476ed84726a8` in the primary
`release/v0.1.0` checkout. The entire B04 work package remains in progress.
B04-R2, B04-R3 and B05 have not begun in this continuation.

Containing enum/const applications now distinguish literal JSON data from
selected raw instances. Forward mappings compile exact object key sets,
required membership, closed extra-property domains and positional array lengths
into equality predicates. Empty legacy octet values become an explicitly raw
instance with zero bytes; JSON empty strings and null placeholders cannot match
that predicate. Nonbinary subtrees use exact CST constants, preserving decimal
lexemes, escaped names, literal reference-looking fields and arbitrary data.
The structural assertion is under double negation, so it cannot add evaluated
property/item annotations that enum/const never supplied. Original literal
operands retain common neutral owners with their original data/provenance.

Modern raw instances cannot equal any JSON literal at a present binary slot.
Reverse containing-literal mappings retain only members omitting that slot, or
make the application false when none remain. They preserve ordinary independent
JSON consumers. Source literals that cannot satisfy their positive containing
object/array envelope are eliminated only after exhaustive canonical evaluation.
Filtered containing languages also constrain proofs at their selected leaf
positions: a nonbinary contradiction can make an otherwise unmapped byte pattern
or equality irrelevant. Missing positions and empty arrays do not invent a
present byte value.

The proof graph follows fixed references, positive allOf conjuncts, properties
and item positions. Its positive envelope resets at anyOf, oneOf, negation and
conditional branches. It never assumes the result of a branching applicator
while proving one of that applicator's children. Whole-envelope certificates
supply independent length guards before local predicates are simplified. Local
branch truth and successful metadata are preserved within the guarded domain;
failed whole applications do not acquire successful annotations. Multiple raw
contexts must all justify a replacement. Independent schema/resource consumers,
aliases and neutral JSON definitions continue to use A01–A03's allocator.
Representation-neutral leaves also trigger containing-owner separation when the
literal, rather than the leaf's own keywords, requires different representations.

Constraint certificates combine exact min/max and supported length-language
bounds without allocating their mathematical ranges. Contradictory intersections
become false, retaining their authored operands, including huge exact exponents.
Finite enum/const languages, inherited containing languages and the existing
finite-regex superset parser supply exhaustive candidate sets. Zero/one-octet
bounded domains can be enumerated completely; these are not samples. The existing
canonical evaluator filters candidates under both directions and their captured
source dialect. A length is emitted only when its entire byte alphabet is
accepted. A finite proper subset of byte contents is not relabeled as a length
constraint. Universal string-search patterns reuse the established regex proof
catalog. No string/octet interchange or UTF-8 guess is made.

Named multipart discovery now keeps array containers as modeled data while
classifying their items. A legacy forced-octet view over a JSON/text part
retains its media-binding refusal instead of being classified as ordinary data;
that binding remains R2 work. The planner awaits certificates before occurrence
allocation and before binary conversion. Engine, Core, native review and CLI
retain their existing migration/publication paths. `exact_numbers.ts` and
`schema_evaluation.ts` were inspected and remain unchanged: evaluator **1.18.0+59**
still owns raw streaming maxLength and ordinary Unicode string validation.
Decoded-content validation has not been activated. No second binary evaluator
or semantic ownership registry was introduced.

**Exact remaining R1 refusal conditions:**

- Accepted nonempty byte contents that distinguish equal-length sequences have
  no raw equality/pattern assertion in the target's documented vocabulary. A
  contradiction or redundant application can remove that need only with a
  complete certificate; the keyword's absence alone does not prove the whole
  schema unrepresentable.
- Regex languages outside the universal/length/finite-language certificates,
  nonconstant recursive same-instance proofs, and more general Boolean or
  conditional equivalences without an exhaustive domain remain unproved.
  They are evidence refusals, not approximated languages or automatic target
  impossibility claims. Ordinary property/item recursion remains a finite
  referenced graph; it is not flattened.
- Direction-dependent finite evaluation results, unavailable dialect/reference
  bindings and incompatible independently interpreted resource contexts cannot
  justify one shared certificate. Existing B01/A01–A03 ownership and evidence
  refusals apply; no consumer's meaning is chosen arbitrarily.
- Proof limits refuse the certificate: 2048 route states per media occurrence,
  two million captured proof operations, 50000 literal nodes per equality/path
  proof, 2048 finite members, scalar candidate text up to 1 MiB and containing
  literal text up to 8 MiB. Canonical source evaluation is budgeted at 128 MiB of
  captured work per certificate and 256 MiB per proof capture. No candidate or
  recursive graph is truncated to make conversion succeed.

Implementation owners added are `migration_binary_literals.ts` and
`migration_binary_proofs.ts`. Integration changes `migration_binary.ts`,
`migration_binary_constraints.ts`, `migration_binary_containers.ts`,
`migration_binary_uses.ts` and `migration.ts`. Core `migration.dart` and native
`native_migration_preflight.py` admit migration producer **88**. Graph role rules
**9**, evaluator **1.18.0+59**, response mock **5**, parameter mock **4** and sample
**4** are unchanged. Current regression assertions are synchronized; Core and
preflight retain producer **87**, **86** and older rejection controls.

Prepared regressions extend registered `test_migration_binary.cjs` and
`test_binary_instances.cjs`: JSON/YAML and published patches, exact containing
property/repeated-item literals, modern const lowering, inherited impossible
members, neutral leaves, independent external/aliased consumers, exact numbers,
non-UTF-8 and empty bytes, finite full-byte languages and proper-subset refusals,
negation/oneOf, conditional applicability and metadata comparisons through the
existing production annotation oracle. Nested MIME arrays test the evaluator's
raw predicates and annotation suppression. Core `migration_binary_test.dart`
adds literal, repeated-item, impossible and finite-proof byte exchanges through
unsaved review, existing CLI review, publication and cold reopening, plus R1
cancellation, stale capture and publication-race refusal. Existing native
`migration_review_test.dart` adds a containing-literal/coexisting JSON consumer
to the coordinated review/publication journey. Other regression edits update
producer expectations; no separate test framework or gate was added.

**Actual verification:** source inspection and Git whitespace review only. No
compiler, analyzer, tests, build, generation, CI, graphical workload or
performance check ran. Generated bundles remain unbuilt under the execution
hold. Git hooks are disabled for the local commit. No dependency, third-party
software or installed Flutter SDK was modified. Snapcraft remains skipped.
B04-R2 still owns Swagger file/media alternatives and whole-body encoded
representations; B04-R3 still owns the complete B04 transaction/native/CLI matrix
and overall completion reconciliation. This R1 status is not B04 acceptance.

## B04: constrained and mixed binary representations

**Historical initial B04 handoff; current status is B04-R3 above.** All changes
and regression sources remain unverified. This continuation started at
`25daa11e7b70ee29a647e871e5989ce5f276cc95` in the primary
`release/v0.1.0` checkout. A01–A03 and B01–B03 remain the ownership,
dialect, CST, direction and schema-vocabulary foundations. B05 has not begun.

Binary occurrence discovery now uses the canonical multipart transfer owner.
An opaque part media type does not imply a raw instance when the schema supplies
base64 encoding. URL-encoded values remain modeled data. Incompatible or
conditional transfer evidence stays unknown; it is not guessed from filenames,
extensions or HTTP Content-Encoding. Fixed dynamic references use A03's captured
reference projection, including in containing-owner copies and reference repair.
Competing dynamic targets retain the existing binding refusal.

Containing specialization includes all same-instance assertion branches at a
selected raw position, rather than just the formatted leaf. Other property paths
and independently targeted roots/children keep their neutral owners. Modern
raw/data splits now reuse the same allocator when lowering to 3.0 or Swagger.
There is no recursive schema expansion. Raw assertion inspection uses a finite
visited graph with an explicit work limit instead of a reference-depth cutoff.

The canonical evaluator now implements the optional native streaming
`maxLength` policy described by
[OAS 3.2.1 §4.14.3](https://spec.openapis.org/oas/v3.2.1.html#complete-vs-streaming-content).
Decoder-owned raw instances count bytes, including empty and non-UTF-8 values.
JSON strings still count Unicode characters. `minLength`, `pattern` and content
annotations do not become raw-byte assertions. No decoded-content validation is
activated. Content annotations remain annotations under the existing policy.

Legacy octet-string minimum bounds lower to the exact complement of an octet
maximum; maximum bounds retain their exact CST lexemes. Strict anchored patterns
consisting solely of a universal character atom and a repetition count lower to
byte bounds. A strict end assertion is required because ECMAScript `$` can match
before a final line terminator. Empty-byte enums and impossible octet literals
have exact raw-domain projections. Nonempty byte equality and content-sensitive
patterns have no direct standard raw assertion; a potentially redundant or
impossible conjunction still requires a proof, and is not labeled target
impossibility merely because that proof is absent.

Raw occurrence type predicates, nullable applications, composition branches and
ordinary JSON consumers keep distinct meanings. Reverse mappings project modern
JSON type/equality predicates to assertions rejecting the legacy octet-string
instance. Inactive string constraints retain their exact data in common neutral
literal owners. The planner refreshes the canonical graph after these reverse
projections before running ordinary JSON-domain schema certificates. Those
certificates must inspect the projected predicates, rather than the original
modern predicates that reject raw instances. Coexisting format and base64
annotations now use separate conjuncts, retaining the authored format and the
legacy transfer annotation. Concrete media bindings can retire redundant or
contradicting contentMediaType annotations without inventing a decoder.

**Historical initial B04 requirements (reconciled by B04-R3 above):**

- Containing enum/const projection and its empty-byte/impossible-member
  certificates are now supplied by B04-R1 above. Nonempty byte-content equality
  and unavailable proof conditions retain the precise R1 boundaries.
- Swagger multipart downgrades and occurrence-specific file/data media
  alternatives still need further implementation. The existing flat form and
  differing-media-schema refusals remain; they do not establish that every such
  case is unrepresentable. File must remain confined to legal formData Parameter
  and response-root positions. A Swagger type array containing file is invalid
  source, not a missing modern union mapping.
- B04-R1 supplies finite/intersection/containing-language certificates.
  General pattern and logical equivalences outside those certificates remain
  unproved under the R1 conditions above. Nonempty raw-byte equality has no
  JSON literal spelling, but an enclosing contradictory assertion can make its
  application irrelevant. That distinction remains explicit in refusal reasons.
- Whole opaque bodies with encoded-string annotations still retain the existing
  located refusal. No whole-body base64 binding is invented. Some rejecting or
  inactive occurrence cases can be projected further and remain implementation
  work. Active decoded-content-schema bindings and unsupported encodings retain
  the documented older-vocabulary restrictions; keeping a disconnected schema
  would not preserve an active binding.
- The complete B04-specific file/union, multi-entry, alias, stale-decision,
  publication-failure and relocated cold-reopen matrix is not yet prepared.
  Existing A01–B03 transaction, exact-value and obsolete-producer regressions
  remain registered. The added binary coverage does not close the whole matrix.

Production changes are in `migration_binary.ts`,
`migration_binary_constraints.ts`, `migration_binary_containers.ts`,
`migration_binary_uses.ts`, `migration_schema.ts`, `migration.ts`,
`exact_numbers.ts` and `schema_evaluation.ts`; Core migration/evaluator admission
and native preflight declarations are synchronized. Core, native review and CLI
continue to consume the shared engine and publication transactions. Ordinary
editing does not migrate. Native multipart request generation remains C01.

Prepared engine coverage extends `test_migration_binary.cjs`,
`test_binary_instances.cjs` and `test_migration_direct_swagger.cjs`: published
patch declarations, JSON/YAML, bounds, length-language patterns, empty/impossible
literals, nullable and mixed data unions, sibling composition, recursive
containers, fixed dynamic references, raw conditional predicates, encoded MIME
parts and coexisting annotations. Assertions compare production source/target
evaluation results and retain located no-output negatives. Core
`migration_binary_test.dart` adds constrained shared body, composed body and
multipart-property byte exchanges through unsaved review, CLI review,
publication and cold reopening. Native `migration_review_test.dart` uses a
constrained shared binary definition in coordinated review. Existing registered
suite entries are reused; no separate verification framework was added.

At that continuation, migration producer **87**, evaluator **1.18.0+59**, graph role revision **9**,
response mock **5**, parameter mock **4** and sample **4** were current. Other
regression-file edits updated producer expectations; migration producer
**86** is retained as an obsolete Core/preflight rejection control. Generated
bundles have not been rebuilt and cannot authorize current publication.

**Verification:** source inspection and Git whitespace review only. No compiler,
test, analyzer, build, code generation, CI, graphical/native workload, packaging
or performance check ran. No third-party software, dependencies or installed
Flutter SDK were changed. Snapcraft remains skipped. The execution hold remains
active. This is a partial B04 source handoff, not completion or acceptance.

## B03: remaining schema-vocabulary conversions

**Source-complete, unverified for the established W3.06 certificate families.**
Work started in the primary `release/v0.1.0` checkout at
`15a653fb4697dd53e1c4219ae75950785e570e60`. The main implementation and prepared
regressions are in `18ad1f6`; this handoff also closes conditional constant
predicate proofs. A01–A03's allocator, resource contexts and binding proofs,
B01's directional policy, and B02's conditional/dependency/tuple algorithms
remain authoritative. This status describes source, not executed acceptance.
At the B03 handoff, no B04 implementation had been undertaken.

Name constraints now use captured finite domains from enum/const restrictions,
closed `additionalProperties`, closed unevaluated selections, fixed references
and conjunctions. A bounded parser proves finite supersets for fully anchored
regex languages; the existing canonical evaluator filters complete candidate
sets, including final line terminators. Unsupported syntax or a budget limit
abandons the proof. There is no sampled or truncated unbounded name language.
Finite rejection domains retain an unbounded allowed language through forbidden
named properties: nonempty names, finite enum exclusions and finite regex
complements are included. Name predicates continue to run on strings; their
value consumers keep their original schemas.

Pattern selection supports finite domains, finite regex selectors over open
objects, universally matching selectors, and unbounded selectors whose value
schemas are proved equivalent to an annotation-free additional-property schema.
Every overlapping assertion retains its own application. Explicit properties
and original additional-property exclusions remain distinct. Universal patterns
retire only their inactive additional application; independent schemas remain
material. Ordinary value-schema string complements retain independently entered
negative name schemas in Swagger without inserting a `not` keyword.

Nonconstant containment uses exact all-match/no-match implication and disjointness,
forced all-match counts, redundant bounds proved by actual array bounds, 3.0
existential/complement identities, native Swagger type/string complements, and
exhaustive finite whole-array languages. Finite matching-value domains combined
with `uniqueItems` become exact Boolean presence counts in 3.0 for arrays of
arbitrary length. Literal identity is mathematical and generated operands retain
their exact CST spelling. Predicate metadata applies once per successful match;
count tests suppress their own metadata. Containment predicates survive finite
folding through the existing allocator because enclosing unevaluated selections
can consume them without an authored incoming reference. Conditional constant
predicates reuse the existing truth proof and ordinary conditional conversion.

Unevaluated selection compiles certificates from the captured successful-applicator
graph. Property coverage combines local selectors, all successful anyOf branches,
the successful oneOf branch, conditionals, dependencies, static references and
fixed dynamic references. Guard tests run under `not` and cannot contribute value
metadata. Item coverage similarly combines successful array guards with matching
contains predicates; finite guard partitions do not bound array lengths or values.
Static prefix certificates also project bounded composed tails to Swagger tuples,
retire proved complete coverage, and permit annotation-free uniform implications.
An inline prefix-only conjunct and an equal containing unevaluated tail reuse
B02's homogeneous tuple proof to produce one metadata application. Finite tuple
folding can include a scalar, annotation-free unevaluated assertion and covered
conjunctions; its proof forbids losing nested evaluated-location annotations.
Guard references materialize after ordinary schema owners finish conversion.

Content handling follows the canonical evaluator's existing policy: these fields
annotate strings and do not assert successful decoding or decoded conformance.
`contentSchema` without `contentMediaType`, and content fields proved inapplicable
to strings, retire their application while retaining exact data and independent
schema identities. Active encoding/media mappings still use the existing media
and binary owners. No media type or decoding policy is inferred. Keeping a
standalone content schema is explicitly insufficient to represent its active
decoded-content binding in an older Schema Object.

**Exact remaining refusal boundaries:**

- **Unavailable name proofs:** regex syntax outside the finite-language parser,
  domains outside finite/cofinite/string-truth certificates, active name-instance
  annotations without a faithful projection, and unbounded pattern selections
  without a universal or equivalent-uniform value certificate. Distinct value
  constraints on arbitrary regex-selected names have no direct older-family
  keyword. A failed certificate is not a general target-impossibility claim.
- **Unavailable count proofs:** nonconstant multiple-match counts outside
  structural, forced, exhaustive-language or unique-finite-value certificates.
  Arbitrary array lengths are never approximated. Swagger's lack of Boolean
  applicators separately prevents using 3.0's general existential/complement
  implementation unless a native equivalent is established.
- **Unavailable annotation proofs:** mixed positional and conditional/matching
  coverage outside the exact static-prefix, homogeneous, finite-language or
  value-predicate certificates; same-instance recursive coverage without a
  terminating certificate; and conflicting independently interpreted uses.
  Ordinary recursion through property/item values remains supported. Independently
  entered unbounded order-sensitive tuples retain B02's actual target-vocabulary
  refusal. Competing dynamic bindings retain A03's binding refusal; no candidate
  is guessed. Optional Swagger guards still need a native/finite certificate.
- **Target content restrictions / unavailable bindings:** older Schema Objects
  cannot carry an active decoded `contentSchema` annotation or an unsupported
  encoding annotation. Base64 and concrete media occurrences continue to require
  the existing documented policy and captured binding at every use. Missing or
  incompatible media evidence remains a located proof refusal. Mixed raw/data
  binary ownership, constrained file representation and broader binary container
  specialization remain **B04**, not a B03 completion claim.
- **Evidence limits:** name/domain, regex work, graph depth, exact arithmetic,
  owner edits, finite-language and guard-partition limits reject the certificate.
  They do not establish an infinite language or permit partial output.

Implementation owners added are `migration_schema_name_domains.ts`,
`migration_schema_regex.ts`, `migration_schema_string_complements.ts`,
`migration_schema_contains.ts`, `migration_schema_annotation_guards.ts`,
`migration_schema_evaluated_properties.ts`, `migration_schema_evaluated_items.ts`
and `migration_schema_content.ts`. Integration extends `migration_schema.ts`,
patterns/property-names/proofs/tuples/finite-domain owners and the existing inactive
and binary boundaries. There is no second schema evaluator or ownership registry.
The exact affected-file inventory is recorded in the B03 commits; most remaining
existing regression-file edits only synchronize producer expectations.

Prepared production regressions extend the pattern, property-name, array and
unevaluated suites. `test_migration_content.cjs` is registered in
`tools/build_engine.sh`. `migration_b03_fixture.cjs` compares production source
and target outcomes, successful value/content metadata and its multiplicity,
independent consumers, cold references, exact values and literal/alias history.
Existing official `contains.json` and `unevaluatedProperties.json` supply
independent expected outcomes; their retained upstream revision is unchanged.
Formerly refused allOf object/item coverage and nonconstant containment witnesses
are positive regressions; genuine positional/count/independent-owner refusals
remain negative controls. Published source/target patches, YAML/JSON, open and
closed structures, overlapping selectors, composition, recursion, references,
fixed dynamic references and unbounded-length witnesses are prepared.

Core `migration_b03_test.dart` and native `test/migration_b03_review_test.dart`
share `b03_migration_support.dart`'s external, identified schema resources. They
prepare request/response and independent-consumer comparisons, unsaved root/shared
buffers, exact values and aliases, Core cancellation/stale/collision/failure
checks, CLI review/apply/check, native review/publication, original preservation
and cold reopening after relocation and deletion of originals. Publication and
review transaction implementations are unchanged.

Migration engine, Core admission and native preflight are **86**; current producer
assertions are synchronized, and obsolete **85** is added alongside **84** and
older rejection controls. Evaluator **1.18.0+58**, graph role revision **9**,
response mock **5**, parameter mock **4** and sample **4** are unchanged.

**No compiler, analyzer, test, build, code generation, CI, graphical workload,
packaging or performance check ran.** Only source inspection and Git whitespace
review were performed. Generated bundles remain unbuilt; old producer-85 bundles
are intentionally rejected by current admission. Git hooks were disabled for
local commits to preserve the hold. No third-party software, dependency version
or Flutter SDK was changed. Snapcraft remains skipped. Source completion does
not establish executed equivalence, runtime acceptance or overall BusyAPI
completion. The next assignment is **B04 — Constrained and mixed binary
representation migration**; its subsequent progress is recorded above.

## B02: conditional, dependency and constrained tuple-tail migrations

**Source-complete, unverified for the bounded W3.02–W3.04 assignment.** The
initial B02 work started at `32d39d66def5249d3bfd1f2476d3a745d6dbaf6d`;
this completion continues `af9ab0a26f25e7826477bda0547a0268b408bf45` in the
primary `release/v0.1.0` checkout. The bounded completion program at
`~/Downloads/BusyAPI-bounded-completion-program-20261104.md` remains the scope.
A01–A03's canonical ownership allocator and B01's directional evaluation
policy remain authoritative. At that B02 handoff, B03 had not started. This is a source handoff,
not executed evidence or an overall BusyAPI completion/acceptance declaration.

Conditional lowering retains the existing constant, equivalent-branch and 3.0
applicator algorithms. Its bounded certificates now include implication,
disjointness, native-domain/presence guards, selected type/presence/exact-bound
complements, fixed logical predicate views and exhaustive finite languages.
Outer dependency triggers and inner conditional predicates remain distinct.
A required predicate succeeds on non-objects; a dependency applies only to an
object with its trigger. Guard intersections preserve that distinction.

`migration_guard_projection.ts` composes captured conditional, dependency and
logical applications through the existing `MigrationSchemaOwners` allocator.
Each original effect has an anonymous Schema owner and a separately tracked use;
projection replaces only that use in an assertion variant. Authored conjunctions
have the same ownership treatment, including terminal guarded children. Copies
are deferred until neutral bodies finish ordinary conversion, so external source
ordering cannot select another interpretation. Neutral schemas, independent
predicates/branches, fixed references, recursive value schemas and resource
provenance survive. Planning markers and application uses belong to the existing
semantic-owner index; there is no second ownership registry.

Presence proofs distinguish retained explicit requirements from requirements
established by dependencies. Seeded transitive/cyclic closure, composed/fixed
constraints, exact literals, closed-object counts and forbidden-trigger proofs
remain supported; optional cycles never prove their own presence. Lexical
entry facts stop at independent consumers. Constant/logical preparation keeps
retained conjuncts, preserves successful metadata, hoists independently entered
inactive schemas and retains outgoing dynamic connections. False branches
contribute no successful annotations. Validation implication alone never
licenses dropping an applicable annotation.

Guarded bodies prefer native conjunctions over whole-instance finite folding.
Captured inert logical assertions and exhaustive Cartesian object enums/consts
can be projected without rejecting valid intermediate representations. Exact
literal identity compares mathematical numbers and unordered object members;
fidelity still retains authored CST values. Unknown newly generated logical
representations keep the compatibility refusal until an applicability
certificate exists. Exhaustive finite positional folding also retires pure
conditional/dependency assertions covered by that same source evaluation.

Tuple lowering retains finite positional expansion, uniform-tail implication
and common-conjunct factoring. Exact bounds/divisibility, integer lattices,
finite prefix values, inactive annotations and unreachable-position proofs are
reused. Exhaustive finite languages are filtered through the production source
evaluator in both directions, with captured external example bytes. No finite
cutoff approximates an unbounded language.

`migration_flat_items.ts` now materializes Swagger Parameter/Header schemas and
nested Items Objects from captured fixed references and already-lowered
conjunctions. It consolidates supported types, formats and constraints, exact
bounds, enum intersections and exact divisibility. Nested arrays, finite enums,
closed/unreachable items and zero-length arrays retain their actual language.
No reference or composition field is inserted into an Items Object. Neutral
Schema owners remain available to independent consumers. Header Reference Object
chains are inlined at their uses; original native Header owners move into standard
unused Response.headers slots. Ignored reference siblings remain literal history.
Late allocations use live native containers when another entry has already
become Swagger. Form fields use the same materializer, retaining the existing
form presence and serialization evidence boundaries.

**Remaining limitations and evidence boundaries:**

- Swagger lacks 3.0's general `not`/`anyOf`/`oneOf` applicators. Optional
  dependencies and nonconstant predicates without a captured native, implication,
  complement or exhaustive finite certificate retain a located *unavailable
  proof* refusal. Multiple optional guard triggers need an actual presence
  certificate. This is not a claim that every refused language is inexpressible.
- Same-instance discriminator variants require a captured model-identity
  certificate; a dependency refusal now identifies the actual discriminator as
  `migration.proof.guard-identity`. Competing dynamic bindings retain A03's
  binding limitation. They are never guessed or converted to a fixed target.
- Older targets still refuse separately assigned unsupported schema/native
  vocabulary and annotations at their original locations. General annotated
  composition/vocabulary completion is B03; ordinary newer native objects are
  outside B02. No such blocker is relabeled as target impossibility merely to
  close this assignment.
- Swagger flat Items cannot retain object/null/unrestricted item domains,
  applicable unsupported annotations, recursive concrete item structures or
  proved unbounded order-sensitive tuples. Unequal patterns/conjunctive fields,
  unresolved references and remaining positional shapes without a uniform or
  exhaustive finite certificate retain precise evidence refusals. Annotation
  multiplicity and default/type restrictions are checked independently.
- Proof depth/work, owner, exact-arithmetic and exhaustive-domain budgets abandon
  the proof; they do not prove that no equivalent target exists. Existing wire
  serialization limits, including nested form collections, remain explicit.

No established representable B02 witness remains intentionally blocked by a
missing guard-composition or flat-Items implementation. The former TODO in
`test_migration_dependent_schemas.cjs` is an ordinary positive production
regression, retaining its independent Swagger witness and source/target
instance comparisons.

Prepared engine regressions extend `test_migration_conditions.cjs`,
`test_migration_dependent_schemas.cjs` and the new
`test_migration_flat_items.cjs`; existing dependency/tuple-tail suites remain
registered. Coverage includes published 3.0/3.1/3.2 patches and applicable Swagger
routes, YAML/JSON, direct/referenced/composed/external/recursive owners,
independent branches, different outer/inner predicates, successful/inactive
metadata, Cartesian exact literals, aliases, homogeneous/constrained/finite
conditional tuples, nested/closed/unreachable arrays, shared Header/parameter
chains and mixed native entries. Positive and negative instance comparisons
exercise neutral and actual use positions. The test-only annotation oracle
compares production evaluator metadata without changing target validation.
`tools/build_engine.sh` registers the new flat-Items suite.

Core `migration_b02_test.dart` and native
`test/migration_b02_review_test.dart` share `b02_migration_support.dart` fixtures
for conditions, dependencies, tails, finite tuples, nested dependencies and
fixed-dynamic-reference flat Items. Their existing production journeys cover
unsaved root/shared buffers, request/response and Header/query evaluation, CLI
review/apply/check, cancellation, stale reviews, destination collisions,
publication failure, originals, review presentation and cold reopening after
relocation/deletion of originals. A dirty unsupported item annotation prepares
a nonpublishable Core review before the positive publication path. Normal
editing and publication transactions are unchanged.

Migration engine/Core admission/native preflight are **85**. Current producer
assertions are synchronized; obsolete **84**, **83** and older controls remain
prepared. Evaluator `1.18.0+58`, graph role revision `9`, response mock producer
`5`, parameter mock producer `4` and sample producer `4` are unchanged. No
third-party source, dependency version or SDK was changed.

**No regression was executed.** Source inspection and Git whitespace review
are the only verification performed. No compiler, analyzer, test, build,
code generation, CI, graphical, packaging or performance workload ran. Generated
bundles were not rebuilt. The execution hold remains active and Snapcraft is
skipped. B02's source implementation and registered regressions are ready for
verification when authorized; their results are unknown. The next bounded
assignment is **B03 — Remaining schema-vocabulary conversions**. Overall
BusyAPI SOURCE COMPLETE and ACCEPTED remain unmet.

## B01: directional schemas and shared request/response owners

**Source-complete, unverified for W3.01's directional mappings.** Work started
on `release/v0.1.0` at `f15e9a66df4c1dbf20ed709eb25e4df07fe515f5` in the
primary checkout. A01–A03's allocator, resource preparation and connection
proofs remain authoritative. At the B01 handoff, no B02
conditional/dependency/tuple-tail work had been undertaken.

`migration_direction.ts` now specializes read-only 3.0/3.1/3.2 schemas when
downgrading to Swagger, alongside the existing Swagger and 3.0 upgrade mappings.
Request variants retain properties, exact values and value constraints while
leaving the read-only response annotation with neutral/response owners. Only
3.0 source owners adjust required membership by direction; modern required
assertions remain unconditional. Request-only inline schemas also retain a
neutral material copy, so specialization cannot discard their original
annotation/provenance. Neutral definitions without edited consumers keep their
YAML anchors and aliases; token ownership is prepared on immutable copying
forks rather than indiscriminately on the delivered originals.

Modern-to-3.0 required-presence guards remain the shared implementation.
Coexisting modern `readOnly: true` and `writeOnly: true` annotations now occupy
separate applicable `allOf` schemas, retaining both annotations without violating
3.0's prohibition on that pair in one Schema Object. The guards preserve required
presence in both directions. These mappings follow BusyAPI's existing evaluation
policy: Swagger read-only request exclusion, 3.0 directional required membership,
and modern annotation-only evaluation. They do not claim equivalence under an
external application's unspecified access-enforcement policy.

Directional schema and Header-chain traversal now consumes actual scopes and
references from every captured entry. Dialect/family/literal separation happens
first through A01–A03. Directional allocation uses that same stage's
`MigrationSchemaOwners`; schema/discriminator lookups use the owning capture,
and only the appropriate request/response consumers are repaired. No additional
ownership registry or evaluator was added. Original source provenance, literal
values, security/operation invariants, target validation, captured dirty buffers
and the existing atomic publication boundary remain required.

**Remaining refusals have specific boundaries.** Active `writeOnly` cannot be
represented by a standard Swagger annotation; `migration.schema.write-only`
reports **target-representation** at the original `/writeOnly` field, rather
than silently discarding it or calling it read-only. Object-valued Headers
cannot become Swagger flat Headers; the downgrade inspects captured schema
reference chains before flattening so referenced objects receive the same
located target limitation as direct objects. Missing discriminator wire names
or mappings retain `migration.direction.discriminator-name` with
**source-incomplete** classification. Unresolved/ambiguous references,
unsupported dialects and unsupported legacy/modern native reference boundaries
remain refused. Existing reviewed ignored-sibling and 3.2 discriminator-fallback
decisions remain required. Competing-target dynamic-scope lowering and other
unimplemented older-family vocabulary/flat-object representations retain their
existing implementation classifications in their own register rows; directional
specialization does not purport to implement those algorithms. No remaining
representable W3.01 case is identified as blocked solely by missing directional
specialization.

Prepared engine coverage extends `test_migration_direction.cjs`,
`test_migration_access.cjs` and `test_migration_required_presence.cjs`: all published
source patches on applicable routes, both formats, direct/referenced/composed/
recursive schemas, request-only/response-only/dual/neutral uses, mixed Swagger/3.0
and modern/3.0 entries, shared Header alias chains and independently interpreted literal
resources, fixed dynamic references/resource IDs, escaped names, exact numbers,
YAML aliases, deterministic allocation and cold evaluation. Runtime comparisons
include missing required fields, Swagger-forbidden request fields, write-only
response values, type errors and valid/invalid neighboring bounds/enum values.
Negative controls retain unavailable dependencies, nonstandard Swagger access
fields, active write-only Swagger refusals and unrepresentable object Headers.
An ignored 3.0 write-only reference sibling stays ignored in Swagger and retains
its exact authored value; it does not receive the active-annotation blocker.
The former neutral-alias refusal expectation is replaced by exact neutral-source
preservation; the new target-limitation controls require genuine unsupported
semantics rather than a missing specialization.

Core `migration_access_test.dart` prepares real request/response comparisons,
dirty captures, stale review rejection, cancellation, staged publication failure,
source preservation, cold reopening and CLI review/apply for the additional
routes. Its mixed-entry Header journeys additionally inspect the actual request
and response schema owners, retain unsaved literal resources/YAML aliases, and
reopen relocated output after deleting the originals before cold CLI review.
Native `migration_access_review_test.dart` now reviews actual shared
request/response consumers across all family directions, including Swagger
upgrades, and exposes the precise write-only blocker. Engine suites remain
registered in `tools/build_engine.sh`; Core/native suites use the existing
directory gates in `tools/build_linux.sh` and `tools/test_widgets_local.sh`.

Migration engine/Core admission/native preflight are **83**, with current
assertions synchronized and obsolete **82** rejection prepared alongside the
older negative controls. Evaluator `1.18.0+58`, graph role revision `9`, response
mock producer `5`, parameter mock producer `4` and sample producer `4` are
unchanged. No third-party dependency or SDK was changed.

**All regressions are prepared, not run.** Evidence is limited to source
inspection and Git whitespace review. No compiler, analyzer, test, build, CI,
native/browser, packaging or performance workload was executed. Generated
bundles have not been rebuilt. The execution hold remains active; Snapcraft
remains skipped. Overall BusyAPI SOURCE COMPLETE and ACCEPTED remain unmet.
The next bounded assignment is **B02 — Remaining conditional, dependency and
constrained tuple-tail migrations**.

## A01: mixed-family uses without direct native holders

**Source-complete, unverified for A01's representable no-holder paths.**
The bounded completion program was read from
`~/Downloads/BusyAPI-bounded-completion-program-20261104.md`; the primary
checkout was verified clean at `79694f538da9d4fc3a8f526da84d7ab953d7b561`.
`MigrationSchemaOwners` now supplies standard typed Callback/Path Item/Response
layouts for pre-3.1 Path Items, Operations and pre-3.2 Media. Holder family and
container are checked before allocation; immutable CST copies, exact provenance,
selected-consumer repairs and context/connection proofs remain required. These
unused reusable holders add no public route or discriminator model name, following
the [Components Object rules](https://spec.openapis.org/oas/v3.0.4.html#components-object).
Compatible anonymous Swagger/modern fragments retain their entry semantics.

Intrinsic native schema roots enter the existing resource-holder preparation
when a security/operation name selects their containing object. Foreign native
requirements use collision-checked Security Scheme aliases, excluding configured
names. Compatible families use bare Reference Objects; 3.0 boundaries use common
CST copies only for proved API-key/HTTP declarations, including base-independent
plain descriptions and exact extension data. Equal field profiles can retain an
unchanged name, while the per-entry connection proof still requires its captured
target or a common-allocator copy. Annotated Reference Object overrides, richer
authentication objects and descriptions needing URI-context repair retain the
located `migration.owners.connection-family` implementation refusal. No legacy
Reference Object compatibility exception was added; configuration still uses
the exact projection. Coordinated
Swagger conversion releases only converted generated Path Item/Operation holders
into the common anonymous registry before native component checks. Holder selection also uses the final target
family so an intermediate modern stage cannot leave invalid 3.0 Path Item maps.
Authored Operation method slots are retained; inherited Path Item parameters or
server overrides needing an additional context mapping retain the located
`migration.owners.operation-context` implementation refusal. Source family,
dialect, URI, static/dynamic, literal, alias and publication guards remain
mandatory; declared legacy cross-family references retain their located refusal.

Prepared coverage extends `test_migration_schema_uses.cjs`,
`test_migration_object_uses.cjs` and their existing Core suites, plus registered
`test_migration_mixed_holders.cjs`, Core `migration_mixed_holders_test.dart` and
native `migration_mixed_holders_review_test.dart`. Cases include Swagger↔modern
and 3.0↔modern entries, anonymous Operations, identified recursive schemas,
partial dynamic resources, exact values/aliases, distinct entry URI bases,
traversal-order independence, named connections, authentication-name collisions,
HTTP bytes, unsaved/stale/cancelled captures, original preservation/deletion,
cold relocation, CLI review and precise refusal without output. Producer/Core
admission/native preflight are `80`; obsolete `79` rejection is prepared too.

**All regressions are prepared, not run.** Only source reads/edits and Git
whitespace checks were performed. No compiler, analyzer, test, code generation,
build, CI, native/browser, packaging or performance workload ran; Snapcraft stays
skipped and the installed toolchain/third-party software remain unchanged.
No remaining representable no-holder implementation subcase is identified within
A01's defined boundary. Overlapping destination interpretations remain A02;
whole-resource/dynamic ownership conflicts, inherited Operation context, richer authentication/rendered-URI
mappings and unsupported vocabulary/object conversions retain located refusals
and their assigned follow-on work. The prepared legacy-substitution tests now
assert that refusal instead of demanding an unapproved compatibility exception.
**Next: A02, not started. Overall SOURCE COMPLETE and ACCEPTED remain unmet.**

## A02: independent interpretations of overlapping target containers

**Source-complete, unverified.** The primary checkout started clean on
`release/v0.1.0` at `6074663a45d76a76e9e1983f2da883ff73b0ba12`.
A01's native holder layouts, family restrictions, resource proofs and named
connection mappings remain in use.

Container preparation now considers every captured live entry before allocating
entry variants. It preserves secondary native Objects as well as Schema Objects
at ordinary component maps and their ancestors, including interpretations dormant
in the inserting entry. Both entry and containing-document destinations are
planned before any insertion. Mutually overlapping destinations use immutable
CST captures and the same `MigrationSchemaOwners` reservations, role relations,
provenance and retirement. No second owner registry is introduced. Captured use
records retain entry, role, physical source pointer, family, dialect, URI base,
canonical schema-resource identity, intrinsic parent and literal ownership.
Allocation keys include the intrinsic context without depending on which role
was indexed first.

`migration_owner_references.ts` finishes static reference, discriminator and
operation-URI edges through terminal entry owners after all preparation passes.
This repairs earlier copies whose targets acquire owners in another entry, while
keeping reference-looking literal fields unchanged. Named security aliases,
operation-name materialization and dynamic-reference scope repair retain their
existing algorithms and per-entry proofs. Component insertion still rejects an
unprotected role or physical literal container; source/target family validation,
resource/dialect/URI proofs, exact payload invariants and cold-reopen checks are
mandatory. Native containers are never treated as anonymous schemas merely to
bypass a placement restriction. Placement follows the [OAS Components rules](https://spec.openapis.org/oas/v3.2.1.html#components-object)
and captured schema embedding/resource context follows [JSON Schema Core](https://json-schema.org/draft/2020-12/json-schema-core#section-4.3.5).

Prepared engine coverage extends `test_migration_schema_uses.cjs`,
`test_migration_object_uses.cjs`, `test_migration_document_owners.cjs` and
`test_migration_mixed_holders.cjs`; the former Example/container refusal is now a
positive preservation case. Registered `test_migration_overlapping_containers.cjs`
adds Swagger 2.0 / OpenAPI 3.0 / modern entry combinations, simultaneous native
and Schema map views, dictionary annotations, copied Header edges to later schema
owners, authored allocator-name collisions, reversed resource/interpretation
orders, aliases, exact numbers, unchanged literals and recursive instances.
Modern mixed-holder controls exercise separate `$self` bases, discriminator,
security, operation and dynamic identities with container views.

Core's existing schema/object suites use overlapping fixtures for applicable
modern targets. `migration_overlapping_containers_test.dart` prepares actual
review/publication, unsaved captures, stale review rejection, pre-stage and final
boundary cancellation, destination races, injected staged failure, original-byte
preservation, cold relocation after deleting originals, recursive evaluations and
CLI review. Native `migration_mixed_holders_review_test.dart` adds overlapping
container publication to the real review dialog. Engine registration is in
`tools/build_engine.sh`; Core and native suites use the existing test-directory
gates in `tools/build_linux.sh` / `tools/test_widgets_local.sh`.

Migration engine/Core admission/native preflight are **81**; all current producer
assertions are aligned, with obsolete 80 rejection prepared in Core and preflight.
Evaluator `1.18.0+58`, graph role revision `9`, response mock producer `5`, parameter
mock producer `4` and sample producer `4` are unchanged. No toolchain or third-party
source was modified.

**All regressions are prepared, not run.** Source inspection and Git whitespace
checks provide no runtime acceptance. The execution hold remains active;
Snapcraft stays skipped. No remaining A02 case is identified as blocked solely
by missing destination ownership specialization. Whole-resource identity/dialect
and dynamic-scope conflicts remain A03; vocabulary conversion, inherited
Operation context and richer authentication mappings retain their existing
located implementation blockers and bounded follow-on assignments. These are
unfinished algorithms, not declarations of unrepresentability.
**Next: A03, not started. Overall SOURCE COMPLETE and ACCEPTED remain unmet.**

## A03: whole schema-resource, dialect and dynamic-scope ownership

**Source-complete, unverified for A03 resource ownership.** Work started on the
clean primary `release/v0.1.0` checkout at
`f567e5ca03d5142953859597ba91fc8e202abf6a`. A01/A02 holder layouts,
entry/role specialization, common reservations, CST provenance and native
connection algorithms remain in use.

`migration_schema_resource_contexts.ts` projects complete captured resource
contexts from the canonical graph: independent native Schema roots, intrinsic
parents, nested boundaries, effective dialects and both anchor tables. This is
an immutable capture view, not a new resource registry. Ordinary role/literal
separation now uses the same whole-resource holders as entry specialization.
It deterministically selects a safe existing holder or allocates a common
resource owner, moves all affected roots together, binds their actual dialect,
and retains nested resource boundaries. Unversioned fragments do not inherit an
entry's `jsonSchemaDialect` override. Modern document migration preserves its
source default in both directions, including 3.2 → 3.1. Dialect comparisons use
the existing canonical URI identity, including equivalent empty-fragment
spellings, without treating an unsupported dialect as an available one.

Copied native objects retain independently owned native Schema resources instead
of duplicating their IDs/anchors. Moved Schema slots forward through explicitly
dialected, anchorless resource frames so a destination document's unrelated
anchors cannot enter the evaluation scope. Generated reference fields compose
later entry refinements through `MigrationSchemaOwners`; they are not repaired
as payload strings. Resource identity reservations check every captured entry
and external payload identity. Private generated resource holders and obsolete
copy cycles can retire only after terminal ownership and entering-edge closure
prove them unused. Authored identities remain published, including authored URIs
whose spelling resembles a generated owner.

The final owner-reference pass now repairs `$dynamicRef` using the terminal
resource's named anchor, verifies its initial target and dynamic applicator kind,
and preserves its candidate owners. Preparation and final publication additionally
prove resource/anchor isomorphism: identified and anchor-bearing resources do not
split or merge, effective dialects stay selected, complete anchor tables match,
and forwarding frames introduce no bindings. This proof covers evaluation paths,
not just the supplied example instances. The older-family reference converter
now refuses distinct entry binding sets instead of merging them into a claimed
resolution. These rules follow [JSON Schema Core §§7.1/8.2.3.2](https://json-schema.org/draft/2020-12/json-schema-core#section-8.2.3.2),
[resource bundling and dialect rules](https://json-schema.org/draft/2020-12/json-schema-core#section-9.3)
and [OAS dialect selection](https://spec.openapis.org/oas/v3.1.2.html#specifying-schema-dialects).

Prepared production-path coverage extends `test_migration_schema_uses.cjs`,
`test_migration_static_dynamicref.cjs`, `test_migration_identity.cjs` and
`test_migration_overlapping_containers.cjs`. Registered
`test_migration_schema_resources.cjs` adds ordinary and independent-entry resource
owners, nested relative identifiers, explicit/default and empty-fragment dialect spellings, recursive calls
through forwarding resources, different actual dynamic overrides, existing
implicit holders, retained native identified resources, authored/private-ID
collisions, three-entry anonymous allocation in reversed capture orders,
duplicate IDs/anchors, unsupported dialects, missing resources,
exact values, YAML aliases and cold cross-file relocation. It reuses unmodified
pinned official dynamicRef validity oracles, including intermediate scopes;
the static/dynamic suite adds multiple call paths and scope-exit oracles.

Core `migration_schema_resources_test.dart` and its shared fixture prepare source
and target runtime comparisons for both entry contexts, dirty API/resource
buffers, stale reviews, cancellation before and at publication, destination races,
staged failures, original-byte preservation, cold reopening after deleting
originals, CLI review and unsupported-dialect refusal. Native
`migration_schema_resources_review_test.dart` covers real review publication,
staleness and unsupported dialects. The older native dynamic-ref refusal fixture
now supplies an actual competing captured anchor and expects the current located
implementation message. Engine registration is in `tools/build_engine.sh`;
Core/native files use the existing directory gates in `tools/build_linux.sh` and
`tools/test_widgets_local.sh`.

Migration engine/Core admission/native preflight are **82**; current assertions
are aligned and obsolete 81 rejection is prepared. Evaluator `1.18.0+58`, graph
role revision `9`, response mock producer `5`, parameter mock producer `4` and
sample producer `4` are unchanged. No dependency, third-party source or installed
SDK was changed.

**Remaining refusals are explicit.** No remaining representable A03 resource
ownership subcase is identified as blocked solely by a missing owner algorithm.
Unsupported dialects and unavailable/ambiguous source references remain incomplete
source conditions. A target without a dynamic applicator still requires an
additional representation algorithm when captured bindings can vary:
`migration.schema.dynamic-reference` / `migration.schema.dynamic-anchor` retain
**implementation** classification for older-family dynamic-scope lowering. That
unfinished representation mapping is not claimed unrepresentable or solved by
resource relocation. Vocabulary conversions and refactoring retain their own
register rows. W2/W3 as a whole are not declared complete.

**All regressions are prepared, not run.** Source inspection and Git whitespace
checks are the only verification evidence. No tests, compiler, analyzer, build,
CI, native/browser, packaging or performance execution occurred. The execution
hold remains active and Snapcraft stays skipped.
At the A03 handoff, B01 had not started; its subsequent status is recorded above.
Overall SOURCE COMPLETE and ACCEPTED remain unmet.

## Earlier continuation: exact configuration verification

Core migration review now reads numeric scalar provenance with the existing YAML
parser for both source configuration and delivered JSON. Its independent
comparison uses normalized decimal coefficients and arbitrary-size exponents,
without native numeric decoding or power expansion. Mapping order is ignored;
array order, scalar types and signed zero remain material. Mathematical number
equality is separate from authored spelling. The integer-only authentication
alternative selector retains its existing activation behavior. Alias, original
binding, environment, TLS locator, identity, generation, stale-input and atomic
publication checks remain in force. No parser or dependency was added.

Authority: RFC 8259 §6 and JSON Schema Core §§4.2.2/6.1. The implementation is
`packages/busyapi_core/lib/src/exact_configuration.dart`, integrated in
`migration.dart`. `migration_exact_configuration_test.dart` prepares exact
integer/fraction/exponent equality, map/array/alias and signed-zero controls,
and real engine/Core publication with independently rehashed tampered manifests,
credential changes and authentication selector activation controls. Core's
existing `tools/build_linux.sh` test-directory gate includes the suite.
**Prepared, not run**: execution hold remains active. This correction does not
close W2–W7 or establish SOURCE COMPLETE/ACCEPTED.

The next W2 continuation adds `migration_binary_containers.ts` to the existing
binary-use preparation path. It selects shared containing objects, static chains
and composition routes by finite instance-path states; the existing common
allocator owns every copy. Unrelated nested JSON consumers retain their original
schema references. Independently targeted inline roots/descendants receive an
unchanged neutral owner before a raw media slot becomes a forwarding use.
Copied references retain absolute captured targets except the selected route
edges. No ambiguity guard or separate material registry was added. Native/Core
requests, examples, mocks, Reference and CLI consume the recaptured graph.
Migration producer/admission/preflight are `76`; obsolete producer `75` is
rejected. Existing registered engine/Core binary suites now prepare composed,
containing and independently targeted body/part execution and cold-publication
controls. **Not run** under the execution hold. Remaining W2 ownership contexts,
W3 mappings and W4–W7 work remain open.

W3 now shares `schema_constant_assertions.ts` across conditional, dependency,
containment-count, finite-array-bound and unevaluated-item conversion. Captured
Boolean applicators and fixed references can prove annotation-free constants;
unknown assertions, annotations, dialects, cycles and dynamic choices cannot
supply a proof. Constant applicators lower before child conversion and retain
independently referenced children through existing material owners. Inactive
conditional descendants retain a finite transitive reference closure while the
never-applied containing assertions retire. Resource identities and dynamic or
implicit connections retain their existing conservative guard. Swagger constant
schema dependencies preserve all JSON types and optional trigger behavior.

The registered condition, dependent-schema and array-assertion engine suites and
Core constant-condition/array suites prepare exact source/target comparisons,
negative controls, HTTP requests, native inspection, CLI and cold publication.
Migration producer/admission/preflight are now `77`. **Prepared, not run**;
no compiler, analyzer, tests, build, native workload or Snapcraft was executed.
W3 remains partial; this does not close W1–W7 or SOURCE COMPLETE.

The next W5 bounded-generation continuation extends the existing shared
`SchemaSampleCandidates` used by mocks and discriminator fallback suggestions.
It combines whole-conjunction array length/tuple/containment choices, tries
finite distinct-item diagonals before Cartesian combinations, and constructs
optional/minimum-property objects, additional-property witnesses and finite
property-dependency closures. Parent and alternative object members merge as
exact CST fragments, retaining literal member names and numeric spelling.
The existing 256-candidate / 8 MiB / bounded-state budgets remain authoritative;
every selection still requires proof against the original captured schema and
final status/header/body response validation. No failed search claims
unsatisfiability. Generation producer and Core readiness are `4`; migration
producer is `78` because discriminator suggestions share this constructor.
Existing registered engine/Core mock suites now prepare these HTTP and CLI
cases, including source preservation and obsolete-generation refusal.
**Prepared, not run**. Streaming, CONNECT, media-specific generation, XML,
Linkset and the remaining W1–W7 gaps remain open.

W3 unbounded tuple continuation: `migration_tuple_uniform_tail.ts` proves
that positional prefixes imply an annotation-free type tail. The target keeps
its original positional items and one uniform items conjunct referencing the
retained tail owner, without adding a length bound. Prefix enums/consts use
exact decimal integer classification; fixed references and Boolean composition
retain captured dialect and sibling rules, including legacy nullable/reference
behavior. Tail annotations and unknown implications retain explicit blockers.
Registered tuple-tail engine and Core array-publication suites prepare unbounded
source/target comparisons, independent targets, underflow-fraction negatives,
source preservation, cold publication and CLI checks. Producer/admission are
`79`. **Not run**; W3 remains partial.

Continuation checkpoint for the current primary checkout:

- Branch `release/v0.1.0`; this continuation started at
  `c262eac7e0bef29957301f95420fe9f8c0719608`. Implementation commits are
  `956da8d` (exact Core configuration comparison), `17a1159` (containing binary
  ownership), `b545f3d` (constant/inactive schema mappings), `b1ad20e` (bounded
  witnesses) and `e540d46` (uniform unbounded tuple tails). All changes are local;
  no worktree, push, dependency modification or SDK replacement was performed.
- Earlier W2 source target (superseded for direct-holder shortages by A01 above): `migration_schema_uses.ts`, especially
  `entryComponentLocation`/`entryComponentContainer` and the
  `migration.owners.entry-resource` / `migration.owners.resource-context`
  branches. Independently interpreted destination containers, remaining resource identity
  conflicts and shared-context refactoring still require ownership algorithms.
  The binary extension covers finite static containment/composition routes; it
  does not close general W2 or constrained raw-instance assertion mappings.
- Remaining W3 source work includes active directional downgrade/shared schemas,
  nonconstant conditional/dependency mappings, other constrained binary and
  unbounded tuple tails, vocabulary mappings and source/target reference repairs.
  A missing proof or algorithm remains an implementation item, not a claim of
  normative impossibility.
- W4 typed ordered/nested multipart generation, XML/Linkset codecs and remaining
  parameter/header/part choices remain open. W5 incremental transport and CONNECT
  remain absent; media-specific witness generation remains partial. W6 general
  resource relocation, shared rendering contexts and dynamic-safe maintenance,
  plus W1/W7 full native/application surface closure, remain open in their rows.
- Every added or changed regression is **prepared, not run**. The existing
  registered engine suites and Core directory gate include the new cases.
  Source reads and `git diff --check` establish neither compilation nor runtime
  acceptance. The execution hold and Snapcraft skip remain in force. No external
  prerequisite has been established that prevents further source implementation.
  **SOURCE COMPLETE and ACCEPTED are both unmet.**

## Finite completion register

The active application phases above order this register. Its detailed rows
remain the capability inventory and take precedence over historical summaries. **No work package is accepted or source-complete.**
This continuation began at `62a6972` on `release/v0.1.0`, with a clean
working tree tracking `origin/release/v0.1.0`. The earlier requested baseline
`86fd001dfaacfcf9b93e899642da75238f7486dd` was unavailable during that investigation. No reset, replacement checkout, toolchain change or remote publication
has been performed.

Authority abbreviations in the tables refer to normative text, not the
informational structural artifacts:

- **O20**, **O30**, **O31**, **O32**: the four specification links above. The
  [publication index](https://spec.openapis.org/oas/) lists 2.0; 3.0.0–3.0.4;
  3.1.0–3.1.2; and 3.2.0–3.2.1. Patch declarations remain distinct from
  `info.version`, schema dialects and URI resource identities.
- **J4**: [Draft 4 Validation](https://json-schema.org/draft-04/draft-fge-json-schema-validation-00).
  **JC/JV**: the 2020-12 Core/Validation links above.
- **HTTP**: [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html).
  **MIME**: RFC 2045/2046/7578 above. **URI**: RFC 3986/6901 above and
  [RFC 6570](https://www.rfc-editor.org/rfc/rfc6570.html).
- **WIRE**: [RFC 6265](https://www.rfc-editor.org/rfc/rfc6265.html),
  [RFC 7464](https://www.rfc-editor.org/rfc/rfc7464.html),
  [RFC 9264](https://www.rfc-editor.org/rfc/rfc9264.html),
  [JSON Lines](https://jsonlines.org/),
  [WHATWG SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html),
  [form encoding](https://url.spec.whatwg.org/#application/x-www-form-urlencoded),
  [XML](https://www.w3.org/TR/xml/) and [Namespaces](https://www.w3.org/TR/xml-names/).
- **TEXT**: [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) and
  YAML 1.2.2 above. **PINS**: repository locks, official archive identities and
  exact pinned dependency source enumerated in `docs/tool-support.md`.

Surface abbreviations: **A** creation/Design/Source; **R** native Reference and
documentation; **E** requests, responses, examples, mocks and cases; **M** migration
review/publication; **S** history, save, reopen and Undo/Redo; **C** independent CLI;
**P** preparation/package/CI. Owners below are engine modules under
`tools/contract_engine/src` unless a Core/native/tool path is stated. Test names
without a directory are engine `.cjs` suites, registered in `tools/build_engine.sh`.

Status **Partially implemented** identifies concrete source work still required.
**Source-complete, unverified** requires all source behavior for the stated row;
**Verified** requires current-revision acceptance. **Missing** means required
implementation is absent; **Blocked** names an external prerequisite. Coverage marked **existing** is prepared
coverage, not a claim that the complete requirement is covered. **H** in the last
column means no current-revision acceptance executed: the execution hold applies
to compilers, analyzers, tests, generation, builds, native/browser workloads,
packaging and performance. Source reads and diffs are not acceptance evidence.

### W1: native clause and surface ownership

| ID / requirement and authority | Production owner | Surfaces | Prepared regression coverage | Implementation status / remaining closure | Executed acceptance |
| --- | --- | --- | --- | --- | --- |
| W1.01 Declarations, family capabilities and dialect selection; O20 §6.4.1, O30/O31 Versions and OpenAPI Object, O32 §§4.1–4.2, JC §§8.1–8.2 | `specification.ts`, `contexts.ts`, `reference_graph.ts`, Core `project.dart` | A R E M S C | `test_native_families`, `test_dialect_identities`, `test_malformed_dialects`, Core dialect suites | Partially implemented; existing source for declaration recognition/separation; every published patch still needs current application acceptance | H |
| W1.02 Info, contact, license, external documentation and their fields/relationships; each family's named objects | `authoring.ts`, structural/restricted validators, `document_uris.ts`, native object controls | A R S C | `test_authoring`, `test_document_uris`, `test_terms_server_base` | Partially implemented; modern schema `externalDocs` is now exposed through shared authoring metadata; complete normative field-to-surface closure remains | H |
| W1.03 Servers, variables, URL templates and inheritance; O20 root/operation schemes, O30/O31 Server objects, O32 §§4.5–4.6 | server owners, `swagger_operation.ts`, `reference_projection.ts` | A R E M S C | server URL/context/template/default suites, Core request suites | Partially implemented; existing source for existing implementations; qualify inherited occurrence choices and API URL bases independently of `$self`/`$id` | H |
| W1.04 Paths/Path Items/Operations, fixed methods, exact `additionalOperations` spelling and `query`; O32 §§4.8–4.10, HTTP §9 | `contexts.ts`, graph Path Item view, `operation_semantics.ts`, authoring/execution projections | A R E M S C | `test_path_item_context`, `test_mock_custom_methods`, `test_operation_body_semantics`, request-definition suites | Partially implemented; native authoring/inspection exists; CONNECT execution and older-target operation mappings remain W3/W5 work | H |
| W1.05 Parameter locations, `querystring`, inheritance, schema/content exclusivity, styles and Header objects; family Parameter/Items/Header clauses, O32 §§4.12/4.21 | `parameter_semantics.ts`, Swagger wire owners, authoring, Core request controls | A R E M S C | native20/native30, parameter/style/serialized/header suites | Partially implemented; keep Swagger non-body Parameter/Items/Header rules narrower than Schema Objects; finish W4 representations | H |
| W1.06 Request bodies and response/status/media relationships; O20 body/Response, O30/O31 named objects, O32 §§4.13–4.14/4.16–4.18 | operation/response/media owners, `runtime_media_owner.ts`, Core request | A R E M S C | bodyless/operation-body/response-status/media-selection suites | Partially implemented; same-family shared operation media now use entry-owned variants; newer fields and remaining inherited representations still need W2/W3 closure | H |
| W1.07 Media examples, reusable 3.2 media, `itemSchema`, named/positional/nested Encoding and example-value fields; O32 §§4.14–4.15/4.19 | media/form/multipart owners, `example_representation.ts`, `serialized_examples.ts` | A R E M S C | generic/positional multipart, data-value, example completeness and external-resource suites | Partially implemented; metadata and finite decoding exist; typed generation, streaming and XML/Linkset remain open | H |
| W1.08 Reusable component families and reference eligibility; O20 reusable maps, O30/O31 Components, O32 §4.7 | `authoring.ts`, graph/reference choices, native object controls | A R E M S C | native family/reference position/component-name suites | Schema-authoring portion source-complete, unverified (bounded completion above); other reusable object/media field qualification remains independent | H |
| W1.09 Restricted schemas versus modern vocabularies, boolean schemas, exact numbers and annotations; O20 Schema, O30 Schema, O31/O32 Schema, J4/JC/JV | restricted/structural validators, `schema_evaluation.ts`, schema resource/access owners | A R E M S C | restricted-required, schema-role/definition/property-access/evaluation suites | Schema-authoring portion source-complete, unverified (bounded completion above); full evaluation qualification and migration mapping remain independent | H |
| W1.10 Reference Objects, schema applicators, Path Item references and ignored siblings; family reference clauses, JC §8.2.3 | `contexts.ts`, `reference_graph.ts`, reference projections/choices | A R E M S C | reference-family/position/path-item/context suites | Schema/reference-authoring portion source-complete, unverified (bounded completion above); non-schema Reference/Path Item qualification remains independent; payload controls retained | H |
| W1.11 Links, runtime expressions, callbacks and webhooks; O30/O31/O32 named object clauses | runtime-expression/link/graph owners, authoring and reference projections | A R E M S C | graph/reference/operation-maintenance suites (existing) | Partially implemented; complete field/surface qualification and representable maintenance/migration coverage remain | H |
| W1.12 Tags, summary/kind/parent, entry namespaces and cycles; O32 Tag Object | `authoring_relationships.ts`, authoring, native Reference | A R M S C | `test_relationships`, reference-family suites | Partially implemented; existing source for existing parent/duplicate/cycle rules; downstream migration still incomplete | H |
| W1.13 Security URI bindings, roles, OAuth metadata/device flow and added fields; O32 Security Scheme/OAuth Flow/Security Requirement objects | security owners, graph connections, Core request/security controls | A R E M S C | security-role/selection/URI-binding suites | Partially implemented; native declarations exist; URI-to-name and standard OAuth flow splitting now use shared source owners, request proofs, Core execution and reviewed configuration projection; newer-field mappings and complete native OAuth/device-flow qualification remain | H |
| W1.14 XML node types/names/namespaces and discriminator defaults; **O32 §§4.25–4.26**, O20/O30/O31 corresponding objects | `xml_semantics.ts`, discriminator alternatives/models, authoring | A R E M S C | XML names/namespaces, discriminator alternatives/defaults and negative optional-3.0 suites | Partially implemented; existing corrections retained; XML wire mapping is W4.04; optional 3.0 discriminators stay invalid | H |

### W2–W3: ownership, routing and explicit migration

| ID / requirement and authority | Production owner | Surfaces | Prepared regression coverage | Implementation status / remaining closure | Executed acceptance |
| --- | --- | --- | --- | --- | --- |
| W2.01 Per-use entry namespace, role, family/dialect, URI base, resource boundary, direction and independent literal uses; JC §§8–9, URI/TEXT | `migration_documents.ts`, `MigrationSource`, canonical graph | M S C | document-owner/direction/boolean-owner suites (existing); use-capture controls in document-owner suite | Partially implemented; planning contexts now retain these use records; retrieval bookkeeping no longer creates false conflicts; pure static forwarders share a proved representation across modern entry dialects; differing unversioned schemas/native components now acquire common entry owners through typed containment and reference closure; whole identified resources and implicit boundaries receive independent collision-checked identities; implicit security/discriminator connections and Swagger/modern allOf named-model tables now seed the same closure; partial modern resources and native schema slots now share one proved holder; same-family foreign document uses now receive entry owners too; typed entry owners retain distinct parent roles; operation-name links materialize to exact captured URI targets when their operations acquire variants. Reviewed extract/move/inline, rename and explicit YAML independence reuse exact token ownership through native controls, Core transactions and CLI reviews; mixed-family components use compatible foreign native maps and partial resource holders. Entry-qualified reference/dynamic-candidate and context proofs follow terminal material owners across conversion/relocation, and owning-entry literal/secondary Schema views can specialize. Allocation first preserves map/document Schema views through the same role relation; assertions and polymorphic connections retain compatible named or anonymous holders. A01 adds typed Callback/Path Item/Response containment and proved named-security aliases/copies for mixed-family uses lacking direct holders; coordinated Swagger conversion releases generated native holders through the common CST owner. A02 adds all-entry immutable capture of secondary native/Schema destination interpretations, canonical resource/intrinsic-parent use records and terminal-owner static connection repair; A03 extends the common resource algorithm to ordinary literal/native roles, deterministic same-resource holders, dialect preservation in both modern directions, neutral forwarding frames, complete anchor/resource proofs and private-owner retirement; remaining representation/refactoring work stays in its assigned rows | H |
| W2.02 One deterministic specialization mechanism, selected-consumer repair, collisions and provenance; JC resource/reference rules, family object clauses | `migration_schema_owners.ts`, migration direction/discriminator/identity/shared-text/examples, `migration_schema_uses.ts` | M E S C | alias/boolean/inactive annotation/direction suites, `test_migration_schema_uses`, `test_migration_object_uses`, Core `migration_schema_uses_test` / `migration_object_uses_test` and existing publication suites | Partially implemented; common allocator serves schema containers, boolean/annotation/condition/tuple/name owners and direction/discriminator states, plus security binding/flow variants and ignored Reference Object literal owners. Additional typed uses compose transitively through the same provenance; anonymous storage retains each source format and ordered sequence expansion retains original member coordinates. Pre-conversion and patch-relocation ownership separates established schema and native object uses from data; repairs select intrinsic roles. Anchored/dynamic uses retain a proved existing resource through ordinary schema/object holders or their own retained $id. Native overlapping roles now use the same allocator and per-role static reference repair; Design, Reference, schema trees, examples and validation retain established interpretations. Independent native/schema URI contexts, intrinsic containment, meta roots and exact executable views retain the canonical source owner; role-selected Markdown bases survive scalar navigation. Cross-entry static forwarding and recursive/schema/Header ownership now propagate to each entry; whole identified/dynamic resources use entry-owned identity namespaces and active-owner conversion/relocation; entry namespaces, Swagger model tables and ordinary role/literal copies now use captured active contexts; partial modern schema/native-field resources share common material owners and captured slot references; model-sensitive map and whole-resource views now use neutral anonymous holders, including boolean alternatives, and forward proved native identified children through that same material-owner primitive; compatible foreign component maps preserve mixed-family source contexts through the same allocator and proofs; restricted Schema Object copies and conversion hoists now share anonymous array-item owners, captured entry contexts, passive URI preservation and common reservation/provenance/retirement; containing and composition-dependent binary uses now select finite instance-path owners, preserve independently targeted inline roots/descendants through neutral owners, and repair only captured route edges; A01 extends the same owner layouts to mixed-family Operations, pre-3.1 Path Items and pre-3.2 Media without direct holders, including intrinsic schema resources and named security aliases; A02 prepares mutually overlapping component destinations through the same allocator before insertion, including native Objects and interpretations active only in other entries, and repairs copied static fields after later targets materialize; A03 adds whole-resource capture/proofs, generated-slot connection composition, collision checks across captured entries and proved retirement of superseded private resources; remaining representation/refactoring work stays in its assigned rows | H |
| W2.03 Twelve directed routes and same-family patch behavior; family schema clauses, J4/JC applicators | `migration_routes.ts`, Swagger/schema/binary/direction owners | M S C | `test_migration_entry_routes`, `test_migration_direct_swagger`, `test_swagger_empty_tuple`, Core entry routes and `migration_direct_swagger_test.dart` | Partially implemented; Swagger-to-modern now bypasses 3.0, mapping positional items directly; empty tuples retain no-op meaning; full route qualification and shared-role cases remain | H |
| W3.01 Directional annotations and shared request/response/Header consumers in both directions; O20 Schema, O30 Schema, O31/O32 annotations | `migration_access.ts`, `migration_direction.ts`, required-presence owner | M E S C | direction/access/required-presence/Header suites, Core HTTP/CLI access journeys and native access review | Source-complete, unverified within B01; read-only Swagger downgrades specialize captured request/response owners, modern required presence and coexisting annotations survive 3.0 lowering, and shared Header/mixed-entry uses reuse A01–A03 ownership. Active writeOnly has a located Swagger target limitation; unavailable source bindings retain blockers | H |
| W3.02 Positional tuples/tails, recursion, exact bounds and references; J4 §5.3, JC §10.3.1 | `migration_schema_tuples.ts`, `migration_tuple_uniform_tail.ts`, finite-domain and shared schema owners | M E S C | tuple-tail/empty-tuple suites, Core/native B02 journeys | Source-complete for bounded B02, unverified; existing finite positional expansion retained; uniform proofs now include exact bounds/divisibility, integer lattices, object coverage, inactive annotations and shared conjunct/keyword factoring; homogeneous and exhaustive finite languages reach 3.0; unreachable positions retain independent owners. Work limits remain evidence refusals. Concrete Swagger Items materialization now covers supported primitive/nested-array references and conjunctions; flat annotation, type and recursion restrictions remain precise | H |
| W3.03 Conditional assertions and inactive conditional fields; JC §10.2.2 | `migration_schema_conditions.ts`, guard projections, shared owner allocator | M E S C | conditional suite with instance/annotation comparisons, Core/native B02 journeys | Source-complete for bounded B02, unverified; existing 3.0/constant/equal-branch mappings retained; positive implication, forced branches, native-domain/presence guards, selected complements and finite reductions added; inactive native applications preserve independent descendant closures. Nested conditional/dependency/logical effects now compose through independent application uses; exact finite/inert logical applicability is captured; unproved guards retain evidence refusals | H |
| W3.04 Property/schema dependencies with independently referenced maps; JC §10.2.2.4, JV §6.5.4 | `migration_schema_dependencies.ts`, migration presence proofs and existing allocator | M E S C | dependency/dependent-schema suites, Core/native B02 journeys | Source-complete for bounded B02, unverified; constant mappings retained; seeded transitive/cyclic presence, closed/composed/exact constraints, forbidden triggers, native/presence guards and independent owners added. Native conjunctions take priority over finite folding when proved. The independently owned nested conditional witness is now a positive production regression; outer triggers, inner predicates and neutral branches retain separate meanings | H |
| W3.05 Static/dynamic references, anchors, identities and independent annotations; JC §§8–9 | identity/schema-reference/role owners | M E S C | static-dynamicref/identity/boolean/inactive annotation suites, pinned official dynamicRef cases, Core static/dynamic reference publication/HTTP/CLI journeys | Partially implemented; inactive anchors and dynamic applicators whose captured candidates all identify the initial target lower through one shared binding proof. Sibling constraints and recursive references remain separate allOf/static edges; resource/role provenance and cold reopening are proved. Whole-resource entry variants retain static/dynamic targets, anchors and resource boundaries; downstream dynamic dependencies require a same-resource holder. Partial modern resources and native slots now receive common resource owners; moved definitions remain anonymous and native discriminator URI targets repair before stage validation; A03 adds ordinary and foreign whole-resource holders, nested identity/dialect ownership, named dynamic retargeting, resource/anchor isomorphism and neutral native-slot frames; old-family competing-target lowering remains an explicitly unfinished representation mapping, while unsupported dialects and unavailable/ambiguous source identities stay incomplete | H |
| W3.06 Pattern/property-name/contains/count/unevaluated/content constraints; JC §§10–11, JV §§6/8 | `migration_schema.ts`, name-domain/regex/containment/annotation certificate owners, existing binary/reference/dependency owners | M E S C | pattern/property-name/array/unevaluated/content suites, official fixtures, Core/native B03 journeys | Source-complete for established B03 certificate families, unverified; finite/cofinite/closed name proofs, finite/universal/equivalent-uniform pattern selection, nonconstant structural/existential/complement/unique-finite counts, successful composed/reference annotation selection, static/homogeneous/finite positional coverage and inactive content-owner preservation are implemented. Active decoded-content annotations retain actual older-vocabulary refusals; unavailable name/count/coverage/binding certificates and B04 binary work are distinguished in the B03 handoff above | H |
| W3.07 Raw/data/base64/byte/file/union consumers and byte constraints; family binary clauses, JV §8 | `migration_binary.ts`, Swagger flat/media owners | M E S C | migration binary, direct Swagger, form/media, Core and native binary suites | Source-complete, unverified after B04-R3 reconciliation; common entry proof capture, YAML containing literals, exact media-value comparison and intersected singleton cardinality are corrected. R1/R2 mappings share the existing ownership/schema/media pipeline; complete binary transaction/native/CLI/preflight regression sources are registered. Remaining target restrictions, unavailable proofs and source/evidence prerequisites are separately classified and source-located in the R3 register above; no known established representable B04 mapping is deferred | H |
| W3.08 Inherited media, forms/files, examples without schemas, shared operations/body meaning and reusable objects; family object clauses | Swagger media/form/downgrade/operation owners | M E S C | Swagger media/form/bodyless/ignored-body suites, Core form CLI | R1 and R2 source-complete, unverified; inherited media use entry owners, representable parameter/body/response/example/reusable conversions are implemented, bodyless legacy examples retain a precise standard-target restriction, and remaining proof/target boundaries are registered above; B05-R3 adds the newer-object conversions and prepared coverage recorded above but remains partially implemented, unverified | H |
| W3.09 Servers/security/newer-version fields and invariant proof; family clauses, HTTP/URI | servers/security/operation/invariant owners | M E S C | default-server/security-role/entry-route suites, native-object-use publication and URI-key controls | Partially implemented; Retained 3.2 URI security bindings preserve separate role arrays through owner specialization and portable relocation, with target/name-precedence proofs and declaration/scopes invariants. Older-family URI-to-name source paths now allocate separate standard components through the shared allocator and additional typed-use provenance; external/aliased targets, name precedence, exact scope/role arrays and AND/OR order retain captured connection and request proofs. Shared URI requirements seed entry specialization even when their targets agree; source-side moves repair relative URI keys, and targets lacking Path Item component maps use common anonymous holders. Scheme Reference Object materialization retains applicable description overrides and their original Markdown bases. Captured environment aliases, exact manifest text/identity, Core stale/publication checks, native binding review and CLI output are implemented with prepared regressions; execution remains outstanding. Standard OAuth acquisition flows now specialize into one-flow Swagger schemes and ordered OR expansions without merging AND bindings or scope arrays. Compatible global environment selections project through captured effective security-array owners, intersect complete branch sets across operations, and preserve invalid-selection guards. Ignored Reference Object siblings retain full literal copies through the shared anonymous allocator; source formats/comments and exact values survive materialization. Non-OAuth roles in restricted targets, unavailable summary/discovery/device representations and flow metadata without a standard target container retain located blockers. B05-R3a and B05-R3b above are source-complete, unverified: route/configuration projection and established reusable parent/child ownership are implemented, with normative unused-owner target restrictions and prepared regression coverage. The B05-R3 section records the other exact implementation/proof gaps; R3 is not source-complete; R3c above is source-complete, unverified, while R3d-1b-1 through R3d-1b-4 are source-complete, unverified for their established certificate families; R3d as a whole and later bounded newer-field work remain open, and B05-R4 has not begun | H |
| W3.10 Unsaved capture, stale review rejection, original preservation, inventories, exact external bytes, atomic publication and relocated verification; URI/TEXT, Core transaction contract | migration source/examples/invariants; Core `migration.dart` and publication owners | M S C | Core migration/derived-resource/publication suites, engine external examples | R2 source integration is complete and unverified; captured bytes use surviving native locators or proved standard literals, with per-entry ownership, exact payload and cold proofs, immutable review and atomic publication; current runtime/publication acceptance remains required | H |

### W4–W5: wire representations and execution

| ID / requirement and authority | Production owner | Surfaces | Prepared regression coverage | Implementation status / remaining closure | Executed acceptance |
| --- | --- | --- | --- | --- | --- |
| W4.01 Named/ordered/nested multipart generation and decoding, typed/file/union choice, dynamic encoding, media/headers/transfers and exact bytes; O32 Encoding, MIME | runtime form/multipart/encoding owners; Core `request.dart`; native Request | A R E S C | generic/positional/nested/multipart-header/file-shape suites | SOURCE COMPLETE, unverified; captured named/ordered/nested generation, per-instance schema/media/Header choices, approved file captures, original-declaration byte proof, native controls and shared saved-case/CLI preparation are implemented. Specific unavailable codecs, ambiguous bindings and work limits remain located failures; see the W4.01 handoff | H |
| W4.02 Parameter styles, collectionFormat, whole-query content, omission/empty/reserved/Unicode/exact numbers; family Parameter clauses, URI/WIRE | parameter/header codecs, Core request controls | A E S C | parameter/style/optional serialized/Swagger header suites, `test_runtime_parameter_serialization`, Core runtime-proof/external-parameter suites | Partially implemented; complete parameter serializations now evaluate through their captured declaration in Core execution; original Swagger flat/Items rules, exact numbers and header octets are retained; remaining occurrence-specific representations still need closure | H |
| W4.03 Repeated content/style field lines and Set-Cookie; HTTP §§5.2–5.5, O32 §4.21, RFC 6265 | `http_field_lines.ts`, runtime/MIME/parameter owners; Core `response_field_capture.dart`, connection adapter, `proxy_tls_socket.dart`; exact mock proxy | A R E S C | runtime header, mock header/parameter/exact-proxy suites; Core `repeated_header_fields_test`, `response_field_capture_test`, `http_proxy_transport_test`, response-header/CLI suites | Source-complete, unverified; known field definitions authorize ordered list combination; known singleton repeats are invalid; unknown repeated extensions remain separate and incomplete. Core captures original fields before SDK replacement, including HTTP proxy forwarding and verified HTTPS proxy tunnels. SDK proxy resolution/authentication and HTTP parsing remain authoritative; selected trust, hostname/client certificates, cancellation and standard HEAD semantics remain owned. Capture above 64 KiB or unsupported folding is explicitly incomplete | H |
| W4.04 OAS XML data/wire mapping, namespaces/order/escaping and disabled external acquisition; O32 §4.26, XML/Namespaces | XML semantics plus runtime-media/Core codec integration | A R E S C | XML metadata, modeled wire/composition/charset, Core/native/CLI and mock suites | SOURCE COMPLETE, unverified: shared captured codecs and workflow regressions prepared 2026-11-09; precise refusals below | H |
| W4.05 Linkset-to-JSON-model mapping; O32 §4.21.2, RFC 9264/8288/8187 | runtime-media/header codecs and request/mock integrations | A R E S C | Linkset wire/Header, examples, multipart, Core/native/CLI and mock suites | SOURCE COMPLETE, unverified: both representations and actual Header producers connected 2026-11-09 | H |
| W4.06 Parameter/Header externalValue occurrence serialization through approved captured bytes; O30/O31/O32 Example/Parameter/Header objects | `serialized_examples.ts`, serialized-parameter evaluator, `execution.ts`, Core captured-resource owner | A R E S C | external-example-resource and serialized-parameter suites; Core `external_parameter_examples_test.dart` and existing external-resource controls | Partially implemented; evaluation, request-selection projection and Core outgoing validation now reuse captured resources and actual occurrences, including header octets/charsets; query/header production byte-exchange regressions are prepared; acceptance remains pending | H |
| W4.07 Concrete occurrence context, approved external/binary example selection and cache/decision ownership; Example clauses, Core capture contract | external/media/example/request owners | A R E M S C | external-resource/media-identity/binary-selection suites | Partially implemented; reusable media without a concrete occurrence remains missing context, not a guessed format; native external body choices and saved-case/CLI execution now retain approved bytes through one owner-bound selection, including unchanged draft restoration and empty resources; captured external mock responses now retain the same approved byte ownership through negotiation and original response validation; binary Parameter/Header and part controls still need closure | H |
| W5.01 Incremental JSON Lines/NDJSON, JSON text sequences and SSE framing/evaluation; O32 media/itemSchema, WIRE | shared runtime/stream execution, Core request/execution, native Request/Inspector, cases/CLI and exact proxy owners | E M S C | `test_incremental_streaming.cjs`, `test_streaming_mock_proxy.cjs`, Core `incremental_stream_execution_test.dart`, native `incremental_stream_request_test.dart`, retained finite suites | SOURCE COMPLETE, unverified; live original-item proof, protocol dispatch, exact bytes/numbers, capture-bound cancellation and terminal whole proof are connected. Explicit proof/resource boundaries are recorded in the streaming handoff | H |
| W5.02 Multipart sequences, chunk boundaries, cancellation/bounds/retention, malformed/truncated terminal status and whole-sequence versus item results; MIME/WIRE | existing MIME scanner/decoder plus stream transport, storage, evaluation and Inspector owners | E M S C | same registered Engine/Core/native/CLI production journeys, nested MIME/binary/transfer and incomplete/Stop controls | SOURCE COMPLETE, unverified; original MIME grammar/Headers/transfers/positional schemas remain authoritative, including nested child delivery before enclosing closure. Whole-context bindings and bounded enclosing items retain precise unavailable proof | H |
| W5.03 Authority-form CONNECT, successful tunnel transition, bounded approved peers, bidirectional bytes and closure; HTTP §9.3.6 | mock native validation/server/transport; Core/native mock ownership | E S C | `test_mock_connect.cjs`, Core `mock_connect_test.dart` (including packaged CLI), native `mock_connect_workflow_test.dart`, retained custom-method controls | SOURCE COMPLETE, unverified for exact approved pinned peers with explicit bounds; original CONNECT ownership, security/constraints, bodyless transition, duplex bytes/FINs, cancellation/timeouts/shutdown and separate lifecycle results are connected | H |
| W5.04 Bounded object/array/composition/reference/media-aware generated witnesses and final original-schema/status/header/body proof; JC/JV, family response clauses | schema sample candidates, mock sample/generation/response owners | E S C | numeric/nested/schema-sample/media/final-response suites plus `test_mock_constructive_witnesses.cjs`, Core/CLI `mock_connect_test.dart` and native `mock_connect_workflow_test.dart` | SOURCE COMPLETE, unverified within explicit candidate/work/byte/depth bounds: finite exact values, supported string patterns, flat and composed object/array candidates, finite conditional merges and terminating recursive proposals; text/raw-binary wire candidates use original captured media proof. W4 and finite sequence/SSE codecs remain shared. Unsupported syntax, ambiguous codecs and exhausted construction/evaluation return unavailable evidence | H |

### W6–W8: maintenance, integration and qualification

| ID / requirement and authority | Production owner | Surfaces | Prepared regression coverage | Implementation status / remaining closure | Executed acceptance |
| --- | --- | --- | --- | --- | --- |
| W6.01 Rename/extract/copy/inline/relocate at every schema-bearing position; JC §§8–10, family Schema/Components clauses | refactoring/copy/file owners, canonical schema traversal, Core transactions | A R S C | refactoring/copy/extract/file/schema-definition suites | Partially implemented; reviewed extract, definition move, new-file extraction, inline and renames now share migration YAML token ownership, original-coordinate transactions and native controls. Rename reads alias-backed required/dependency/composition relationships through logical paths and owns only affected writes, including security fields/configuration. Explicit YAML independence retains all logical values and graph identities and enables subsequent ordinary native controls. CLI review/apply exposes existing object/file maintenance and operation/root moves through the same Core plans, captured file intents and grouped publication. Full schema-bearing-position and independently interpreted role coverage remains; current cold-reopen qualification is pending | H |
| W6.02 Preserve resource/dialect/anchor and dynamic evaluation scope without weakening recursion/identity/Path Item guards; JC §§8–9 | `refactoring_copy.ts`, `schema_relocation.ts`, file/URI owners, reference choices/graph | A R S C | copy/file/graph/schema-resource-view suites; Core/native review and CLI regressions, including static dynamicRef, official dynamic binding, dialect and recursion controls | W6-M1 complete-resource extraction/definition movement/file relocation is source-complete, unverified: canonical IDs are repaired outer first across same-file and cross-file bases; dynamic approval requires resource/binding/evaluation-edge equivalence, including generated forwarding frames. Partial inherited resources, conflicting identities/anchors, literal identifier rewrites, identified-resource inlining, unproved dynamic scopes and non-schema chains remain refused; overlapping ownership and general schema-position closure remain outside M1 | H |
| W6.03 Shared/conflicting Markdown and dual literal/contract owners; TEXT/URI, O32 URI-base clauses | refactoring Markdown/file/copy, migration shared-text, URI owners | A R M S C | Markdown identity/location/shared-text/refactoring suites, native-object-use migration controls | W6-M2 bounded shared Markdown and compatible semantic ownership separation is source-complete, unverified: copy/inline/file plans preserve every captured rendered role; shared spellings are proved jointly, and incompatible physical descriptions specialize editable incoming contract uses through existing inline/file proofs. Extraction can retain exact literal source while redirecting its contract interpretation, including complete identified/dynamic resources. Literal/opaque-byte conflicts, unavailable role/resource/inline proofs and work bounds remain precise refusals; see W6-M2 below | H |
| W6.04 Complete native Reference/export and exact pinned external renderer/generator/comparator adapters; family clauses, PINS | native Reference, `derived_bundle.ts`, Core renderer/export adapters | R M S C | reference family/display/Markdown, bundle/resource-package/adapter suites | Partially implemented; native family paths exist; complete relocated/offline output and exact adapter limitation qualification remain; never strip/relabel source to satisfy an adapter | H |
| W7.01 Creation, editing, unsaved Reference, request/example/mock/case, migration review, documentation and CLI integration for every capability; all applicable clauses above | shared engine, Core owners and native workspace controls | A R E M S C | engine/Core/widget/native journey suites | Partially implemented; applicable existing consumers inherit shared field/codec/routing changes; complete family journeys are not accepted | H |
| W7.02 Stale-action invalidation on declaration/dialect/root/external/approval changes; coherent reviewed transactions, Undo/Redo and no buffer loss; Core transaction contract | Core project/store/capture and native review/request controllers | A R E M S C | stale capture/cancellation/publication/widget review suites | Partially implemented; existing source for existing safeguards; new paths require current integration qualification | H |
| W7.03 CST fidelity, no-op saves, exact values, aliases, extensions and source-only migration restructuring; TEXT | `document.ts`, graph/CST editing, Core store/transaction owners | A R M S C | source ownership/alias/exact-value/no-op suites | Partially implemented; existing source for existing boundaries; generated schema owners retain original provenance and reviewed restructuring | H |
| W7.04 Typed bounded owners, revision admission, obsolete-proof rejection and official unmodified dependencies; PINS | engine producer metadata, Core `project.dart`, mock readiness, native preflight | A R E M S C P | mock revision/readiness, Core runtime-parameter proof and migration producer consistency regressions | Partially implemented; existing source for scoped revision update: schema evaluator `1.18.0+67` (final W5 proof), stream representation/protocol `2`, multipart projection `2`, migration producer `104`, response mock producer `5`, parameter mock producer `6`, sample producer `5`, tunnel producer `1`; no dependency versions/source changed | H |
| W8.01 Explicit independent evidence input across SDK/build/CMake/CI/installed/package checks; PINS | `flutter_archive.py`, SDK verifier, `build_linux.sh`, CMake, package/native-distribution/artifact-smoke inputs | P | `tools/test_flutter_sdk.py`, source-wiring regressions | Partially implemented; existing source for archive-input propagation; same existing evidence reaches installed checks; independent member pins remain an alternative; no SDK acquisition/replacement | H; actual evidence availability/authenticity has not been qualified |
| W8.02 Ordered gates, registration, source-version-valid fixtures and production-byte regressions; PINS and each row's authority | `tools/build_engine.sh`, Linux workflow, engine/Core/widget/native/package suites | P | new direct-Swagger/conditional/tuple-tail/constant-containment/property-name/runtime-parameter and URI-security/OAuth-flow/invariant regressions registered; existing TypeScript-before-bundle gate retained | Partially implemented; compilation and all suspended gates remain unexecuted; missing regression coverage identified in this register remains implementation work | H |
| W8.03 Current automated/native/packaged/offline acceptance and normal Quit; all approved families and PINS | native acceptance tools, Core/package/CLI suites | A R E M S C P | existing native acceptance including historical Quit/focus failures; complete new journeys still required | Missing for accepted evidence; no driver/engine attribution established; Snapcraft remains skipped | H |

Invalid source is recorded as source invalidity; absent approved byte resources
remain availability failures. A bounded evaluator/search refusal is incomplete
evaluation, not proof of invalidity or unsatisfiability. A specifically established
target restriction is separate from a missing mapping algorithm. External adapter
limits are separate from native product capability. Neither the execution hold
nor missing Flutter provenance evidence closes any implementation row.

Current source-only work has not executed any acceptance command. The permitted
commands used to inspect/edit the checkout include `git status`, `git log`,
`git cat-file`, `rg`, source reads and patch application. `git cat-file` could not
find the supplied baseline object. These outcomes establish checkout state only.
Authorized qualification must follow the six-gate order in the assignment;
all current-revision automated, native and packaged acceptance remains pending.

Local implementation commits are `485da29` (scoped migration/native wire changes),
`9822c08` (captured parameter runtime admission and HTTP octets), and `7ffa70f`
(finite property-name mappings and retained owners). Their regressions are prepared
and registered but unexecuted. No full work package is closed by these commits.
Build-evidence input wiring and the original completion register were committed
in `62a6972`. The primary checkout and its `release/v0.1.0` branch are retained; no remote publication or CI trigger is part of this handoff.

Repeated HTTP fields now share a positive field-definition inventory, rather
than a singleton exclusion list. Runtime responses, serialized examples, MIME
headers and mock request parameters use it. Unknown repeated extensions retain
ordered lines and incomplete interpretation; ETag and other known non-list
fields cannot pass by comma combination. Set-Cookie retains its separate 3.2
representation. Core passively captures fields before Dart's header setters
replace Date/Content-Type values, without changing bytes delivered to the SDK.
One exchange owns one capture; standard methods keep the SDK's method identity,
while custom method casing keeps the existing prefix adapter. The 64-KiB capture
bound and unsupported folding retain incomplete evidence, never a cooked-header
fallback. The exact mock proxy transport now serves all methods, retaining raw
request/response lines and separate encoded/decoded body views. Source-only
regressions cover actual HTTP and CLI outcomes, informational blocks, HEAD,
unknown/singleton/list fields, exact values, Set-Cookie and obsolete readiness
proofs. Evaluator 1.18.0+57 and response/parameter mock producers 4 agree across
engine/Core readiness. These regressions, analysis, builds and acceptance have
not run. W4.03 source completion does not close the other W4 requirements.

The connection adapter now honors the SDK's selected HTTP proxy host/port.
HTTPS retains SDK environment/no_proxy resolution and SDK validation of the
complete PAC route list before any connection. SDK CONNECT parsing and proxy
authentication run over the existing raw TCP owner; its subscription transfers
to the same cancellable TLS owner used for direct requests. The pinned SDK's
private Socket upgrade cannot operate on an application decorator, so the outer
HttpClient receives the verified TLS socket and frames the original application
request. Origin field capture starts above TLS and excludes proxy control fields.
No DIRECT route is invented. Only a configured DIRECT entry may bypass a proxy.
RFC 9110 §9.3.6 governs successful 2xx CONNECT transitions and ignored control
length fields. Trust roots, target hostname and client certificate selection stay
with the SDK TLS implementation; deadline/cancel closes the actual TCP owner.
Route capture is bounded to 64 KiB and 256 entries. Core/CLI source regressions
cover GET/POST/custom methods, absolute-form forwarding, authenticated 200/201
tunnels, ordered origin fields, repeated ETag rejection, explicit fallback/no_proxy,
malformed routes, credential isolation, failed trust/name checks and termination
during CONNECT/TLS. They have not run. This internal client-proxy tunnel does not
implement the still-missing application/mock CONNECT work in W5.03.

Anchored and dynamic independent schema uses now reserve an ordinary `$defs`
owner in a captured schema with the same resource boundary, URI, family and
dialect, or retain their own existing `$id` in the separate resource. No resource
identifier is invented. `$defs` adds no evaluated assertion or annotation (JC
§8.2.4). Every intrinsic schema's URI/dialect/family is compared after graph
recapture, and every captured static, dynamic and implicit connection receives a
role-specific target proof before conversion. Dynamic starting anchors remain
named (JC §8.2.3.2); published dynamic candidate proofs exclude surviving data
occurrences. Recursive references remain references. Copies use the pristine
captured values, so generated definitions cannot leak into another use's unknown
schema annotations. Ignored legacy Reference Object siblings remain outside the
intrinsic use; independent schemas reached inside that data receive their own
owners. Source/target instance regressions include actual stricter dynamic callers,
static-anchor downgrades, every published modern source patch, YAML/JSON, exact
values, literal preservation, explicit decisions and Core publication/cold reopen.
Unchanged self-contained dynamic-scope cases from the pinned official JSON Schema
Test Suite supply independent source/target validity expectations.
These regressions have not run. Missing resource holders and competing-target dynamic
lowering remain explicit implementation blockers, not unrepresentability claims.

The same pass now separates captured native Headers, Parameters, Responses,
Request Bodies, Examples, Media Types, Links, callbacks, Path Items, security
schemes and operation targets from literal data. It also runs before a same-family
patch update's relocation without adding a family-conversion stage or discriminator
fallback decision. Intrinsic containment stops at the family's Reference Object
boundary; only typed references, document URI fields and Server templates receive
the copied role's repairs. Each intrinsic role/family/dialect is proved on graph
recapture. Native component owners retain the containing document's URI context;
anchored schema children keep that same resource. Literal values, aliases and a
separate schema interpretation retain their own data/annotation values. Existing
Markdown and external-example owners consume the resulting provenance rather
than implementing separate specialization systems. Prepared production regressions
combine these object kinds, exact numbers, named external-byte occurrences, API
and document URI bases, HTTP field/query/body evaluation, same-family patches,
publication, relocation and cold reopening. Core coverage selects request examples,
inspects actual HTTP bytes and prepares CLI checks after deleting source inputs.
Missing/denied resources retain incomplete diagnostics. None of this coverage has
run; cross-entry propagation and multiple non-schema object interpretations remain
W2 implementation work.

OpenAPI 3.2 URI Security Requirement keys use CST key renames, preserving distinct
scope/role arrays even when two original URI spellings selected one scheme.
Current-location provenance composes key moves with semantic owner copies.
Relocation reuses native URI construction and explicitly proves the target in the
actual name/URI namespace, including component-name precedence and key collisions.
Request invariants compare captured authentication declarations and attached
scopes/roles for URI bindings; implicit component names remain part of the proof.
Markdown metadata retains its independent destination proof. Prepared YAML/JSON
cases publish and relocate multiple bindings without source-file dependencies.

Independent schema-use ownership now precedes conversion through
`migration_schema_uses.ts` and the existing `MigrationSchemaOwners`/CST owners.
Copies use standard separate schema resources so they do not add implicit
component model names. Conversion coordinates remain distinct from original
review provenance. Only captured typed consumers and intrinsic fields are
repaired; literal payloads and schema annotations keep their own meanings.
The same allocation boundary serves definition hoisting, directional schemas,
Headers and discriminator states. Markdown, example locators and connection
proofs select surviving semantic occurrences; exact-data invariants still require
surviving unchanged literal values. Source validation, ambiguity guards,
resource bounds and target/cold-reopen checks remain mandatory. The migration
producer is 44 at the engine, Core and native preflight boundaries. Prepared
engine and Core regressions cover dependency-map schema uses, literal schemas,
recursion, document identity, Header references, exact data, cancellation, stale
reviews and publication. They have not run. W2 remains partially implemented:
cross-entry conflicts, independently interpreted resources without a proved
holder/boundary, competing-target dynamic-scope lowering and overlapping non-schema
object roles still have specific implementation blockers.

Fixed dynamic bindings now lower to Swagger 2.0/OpenAPI 3.0 through
`MigrationSchemaReferences`, reusing the canonical `schema_reference_projection.ts`
also consumed by media and discriminator owners. A resolved dynamic applicator is fixed only when
every captured matching anchor is its initial target (JC §8.2.3.2). No alternative
schema is selected by ordering or sample outcomes. The same predicate controls
anchor removal, typed reference repair and final connection/scope invariants.
Sibling assertions keep separate allOf branches, and recursive edges remain
references. Matching-anchor inspection is bounded to two million captured
candidates. Competing targets retain located implementation blockers; unknown
future external callers are outside the existing captured-project guarantee.
Prepared engine regressions compare source/target instances, exact values,
recursive and independently owned literal uses, plus unchanged official suite
validity oracles. Core workflows cover shared external resources, actual request
and response bytes, original files, stale reviews after adding an anchor, safe
publication/cold reopening and independent CLI review/apply. None have run.

Finite property-name lowering follows [JSON Schema Core §10.3.2.4](https://json-schema.org/draft/2020-12/json-schema-core#section-10.3.2.4):
only string property names are tested. For the admitted annotation-free
`type`/`enum`/`const` forms, their string intersection is either unrestricted or
a finite set. A separate `allOf` branch with exactly that set in `properties`
and `additionalProperties: false` admits precisely those object names without
changing existing value constraints. An empty set becomes `maxProperties: 0`;
non-objects are unaffected. Referenced name schemas and exact enum/const operands
keep their converted owner through the common allocator. General/annotated forms and dual literal/schema
roles retain specific implementation blockers. No new annotation semantics or
compatibility extension is invented. Prepared comparisons include both restricted
target families, every published modern source patch, aliases, collisions, exact
values, literal consumers and independent schema evaluation. Core publication
and cold-reopen regressions use the same shared path; none have been executed.

Complete runtime parameter serializations now carry only the captured Parameter
occurrence, text, subject and location. The engine resolves that occurrence's
family, references, styles, media and original schema. Core requires the current
producer and one matching ownership proof for every supplied packet; missing,
duplicate, malformed, replaced and obsolete proofs fail admission. Actual HTTP
content fields use a Latin-1 octet view before media decoding; authored Unicode
serializations remain distinct. Runtime inversion has byte-work and candidate
bounds, and bounded refusal remains incomplete evaluation. The prepared Core
external-parameter regression exchanges the actual query and UTF-8 JSON header
bytes through the production request transport. This is unexecuted coverage, not
accepted byte-exchange evidence.

The conditional mapping argument is local to modern-to-3.0 schemas: an appended
`allOf` branch contains mutually exclusive `anyOf` branches. The positive branch
applies the retained condition and `then`; the negative branch negates that same
condition and applies `else`. Missing branches have no added assertion. Only the
successful positive condition contributes its annotations. Hoisting that condition
preserves one independent reference target; moving each consequent preserves its
own provenance. Without `if`, `then`/`else` are inactive; independently referenced
schemas still receive owners. Overlapping literal/object interpretations retain
an implementation blocker. Source/target instance comparisons supplement this
argument; none have been executed.

The finite-tail mapping argument uses an authored, exact, non-negative integer
`maxItems`. Every reachable position after `prefixItems` applies the same retained
tail through a generated reference; the original prefix constraints and array
bound remain. Closed boolean tails clamp the maximum to the prefix length when
necessary, and independently referenced boolean tails keep their schema owners.
Names use the common collision-safe allocator. Expansion is bounded by 2048
positions and the shared CST edit-work budget; a budget refusal does not establish
that no equivalent target schema exists. Unbounded constrained-tail conversions
remain in the implementation queue. `migration_schema_tuples.ts` owns this mapping;
`test_migration_tuple_tails.cjs` prepares behavioral, exact-value, collision,
independent-target and cold-graph controls.

| Area | Owner | Implementation status | Current verification |
| --- | --- | --- | --- |
| Family declarations, dialects and capabilities | Engine specification and graph | Implemented; detailed remaining semantics below | Complete current qualification pending |
| Native creation, Design, Source and Reference | Engine authoring/projection, Core, native presentation | Implemented subsets in all four families; required gaps remain | Complete current qualification pending |
| Restricted schemas and modern schema resources | Engine schema owners and exact evaluator | Family-specific rules implemented; unsupported dialects remain explicit | Complete current qualification pending |
| Embedded multipart text examples | Shared MIME/text owners, Core request preparation | Authored Unicode, explicit bytes, transfer encodings and part charsets have distinct paths | Implemented but unverified |
| Available external media examples | Captured byte resources and shared media evaluation | Exact approved bytes retain media/schema/source ownership | Implemented but unverified |
| Portable external-example migration | Migration examples, Core publication and shared review | Exact byte copies, native locator repairs and delivered-resource proofs | Implemented but unverified |
| Scoped binary/byte migration | Migration binary owner | Established raw, text/JSON and base64 contexts mapped; mixed/constrained contexts remain | Implemented but unverified |
| Modern required-property lowering | Migration required-presence owner | Scoped modern-to-3.0 presence assertions retain constraints | Implemented but unverified |
| Inactive annotation downgrades | Schema migration and canonical ownership | False writeOnly/deprecated annotations lower to Swagger defaults; independently referenced boolean schemas retain collision-safe owners | Implemented but unverified; active directional annotations remain incomplete |
| Shared boolean-schema downgrades | Schema migration, captured references and CST provenance | Boolean additionalProperties fields retain their values; independently referenced schema roles receive standard definitions with repaired references | Implemented but unverified |
| Directional schema upgrades | Migration direction, canonical graph and CST owners | Swagger request exclusions, 3.0 required-list roles, separate schema resources, nested-target repairs and shared Header reference variants; affected YAML aliases receive separate planning-copy owners | Implemented but unverified; independently interpreted literal and cross-entry ownership remain incomplete |
| YAML migration ownership | Existing source CST and migration provenance | Captured property/alias tokens split affected logical uses, including nested aliases bound outside copied subtrees; exact data, comments and other consumers survive conversion | Implemented but unverified; ordinary editing guards remain unchanged |
| Directional discriminator bindings | Shared named-model table, canonical connections and migration | Implicit/explicit model targets retained without adding component names; 3.2 fallback choices bind eligible composition alternatives and exact instance witnesses | Implemented but unverified; incompatible entry namespaces and indeterminate external names remain blocked |
| Native 3.2 discriminator fallbacks | Canonical composition selector, authoring diagnostics and reference choices | Existing fallback targets checked against adjacent alternatives/allOf descendants; Design selection and Source completion share captured targets | Implemented but unverified |
| Numeric mock witnesses | Shared exact decimal candidate construction and native response proof | YAML/JSON bounds, strict bounds, integer rounding and composed decimal lattices produce bounded suggestions; generated responses require valid native proof | Implemented but unverified; other bounded witness and CONNECT work remains incomplete |
| Swagger discriminator migration | Shared named-model owner and migration specialization | Compatible captured namespaces mapped; shared ownership cases remain | Implemented but unverified |
| Document identity downgrade | Migration URI owner, canonical graph and CST | `$self` lowering captures document URI fields, nested schema identities and reference bases; API URL context remains separate | Implemented but unverified; independent schema/literal ownership remains incomplete |
| Changed-base Markdown | Shared destination-span proof, migration and maintenance owners | Rendered occurrences mapped without rewriting code or prose; migration separates affected YAML alias uses while preserving other exact data | Implemented but unverified; independently interpreted literal/contract occurrences still need separate ownership |
| TypeScript compiler gate | Existing pinned engine build and CI paths | Repeatable compiler check wired before bundling | Implemented but unverified |
| MIME result and Markdown parser typing | Engine execution and Markdown relocation | Literal revision ownership and explicit unknown-value narrowing | Implemented but unverified |
| Migration preflight producer admission | Native fixture preflight, engine and Core | Current revision admitted; regression checks all three production consumers | Implemented but unverified |
| Upstream Flutter/Dart build inputs | SDK verification, CMake, CI and distribution checks | Standard SDK installation; independent official archive identities pinned; version-2 receipts require authenticated member identities | Metadata matched to official publications; selected binary provenance and runtime qualification remain blocked pending independent member evidence |
| Native and packaged acceptance | Existing qualification suites | Required acceptance remains incomplete | Not passed |

### Native object interpretation ownership

O30 §4.3.1 and O31 §4.3.2 allow explicitly reached objects to have
independent interpretations. The canonical graph now retains native roles in
the existing scope owner instead of refusing every non-schema overlap. Every
referenced target still receives its role's structural validation; a Response
without Parameter name/location remains invalid when used as a Parameter.
Role-aware reference lookup is shared by execution, body/example evaluation,
Reference and native reference choices. Design/Reference selectors bind to the
captured graph; a removed role retires pending actions. Schema trees select
intrinsic children rather than another role's physical context. Offline native
documentation records additional roles alongside the original source owner.

Migration separates non-primary native roles through `MigrationSchemaOwners`,
using semantic role/family/dialect/base/resource identity for deterministic
reservation and ordinary native component maps for fragment objects. Original
literal values, exact numbers, Markdown and original review provenance retain
their separate owners. Existing engine object-use and integrity suites now cover
valid Response/Request Body sharing and invalid Parameter interpretation;
Core object-use publication/actual HTTP/CLI coverage includes the same overlap.
The existing native object-page suite adds Design/Reference role controls and
no-op source preservation. These regressions are prepared, not executed.
Evaluator `1.18.0+51`, graph role rules `3` and migration producer `47` invalidate
prior proofs; engine, Core and preflight declarations agree. W2 remains
partially implemented for entry namespace propagation and resource-sensitive
uses without an established faithful owner; W6 shared-role refactoring still
needs its own integration with this common ownership plan.

### Captured array bounds and constant containment

JC §10.3.1 and JV §§6.4.1–6.4.5 distinguish array position assertions from
matching-item counts. `migration_schema_arrays.ts` proves finite tuple bounds
through local assertions, same-instance compositions, fixed captured references,
finite values and unreachable prefixes. It preserves recursive identities and
never borrows an enclosing schema's constraints for an independently used
child. A missing bound stays an implementation refusal, not a claim that the
source cannot be represented. The existing 2048-position specialization budget
and common owner/provenance allocator remain in force. Pure upper-bound
`anyOf` branches also reduce through a finite dominance proof; selected and
independently referenced branches keep common owners. Branches with other
assertions or annotations are not collapsed. Generated schema references use
the allocator's coordinated target component address.

True/empty and false `contains` schemas map to exact `minItems`/`maxItems`
assertions, preserving non-array behavior. Inactive count fields do not become
assertions. A successful all-matching contains marks every item evaluated;
redundant boolean/empty `unevaluatedItems` uses can be retired, while independent
schema references keep their own common owners. Nonconstant containment and
other unevaluated schemas retain precise blockers. OpenAPI 3.0 array branches
receive the required unconstrained `items` object where appropriate.

Existing tuple-tail/document-owner regressions and the registered
`test_migration_array_assertions` exercise source/target evaluation and original
source preservation. Unmodified official `contains.json` cases from the already
pinned JSON Schema Test Suite supply independent validity oracles. Core
`migration_array_assertions_test.dart` prepares unsaved review, cancellation,
publication, original deletion, relocated reopening, actual HTTP response bytes
and CLI checks. Migration producer `46` is synchronized with Core and preflight.
All of this regression coverage remains unexecuted under the hold.

Cross-entry capture now compares every typed role and excludes unversioned
retrieval bookkeeping. A pure static schema forwarder may share a representation
only when both supported modern contexts have identical bases, resource
boundaries and captured static targets. Sibling assertions/annotations and
active dynamic bindings retain the independent-ownership requirement. This
proof removes false mixed-entry refusals without copying resources or treating
dialects as interchangeable. General entry-dependent specialization remains W2
implementation work.

### Restricted Schema Object interpretation owners

O20 Schema Object and O30 §4.3.1/§4.7.24 retain their own restricted vocabularies
when a native Header/Response is also referenced as a Schema Object. The same
canonical role owner now captures these uses, retaining native Design/Reference
choices and independent migration owners. Fast analysis validates additional
restricted roles against the existing family artifact binding; exact validation
and normative restricted rules still run through the original CST. Swagger meta
checks use each captured scope's object kind, so a flat Header and an independent
Schema role cannot select each other's meta-schema through a last-value map.
Schema root discovery retains typed scope metadata through this process.

The registered schema-role suite prepares Swagger Header/Schema and 3.0
Response/Schema positive cases, exact values, native inspection, source/target
evaluation and migration cold graphs. Negative native-field/schema-vocabulary
cases retain located findings. Core `migration_restricted_roles_test.dart`
prepares unsaved inputs, actual HTTP/header bytes, safe publication, source
preservation, relocated reopening and CLI checks. The existing native object
suite includes restricted Schema role selection with no-op source preservation.
These tests remain unexecuted. Evaluator `1.18.0+51`, graph role rules `3` and
migration producer `47` are synchronized with Core/preflight. General entry
namespace propagation and resource-sensitive specialization remain W2 work;
this extension does not remove shared-reference rewrite or identity guards.

### Independent executable resource and rendering contexts

O31 §4.3.2 and O32 §4.1.2 permit independently interpreted source uses;
JC §§8.2–9 retain their resource/dialect identities and dynamic scope. The
canonical graph now records intrinsic schema parents separately from physical
nesting and restores document URI/dialect context for independent native objects.
Context discovery admits proven native owners before retrying a direct schema
pointer. A native Media Schema inside an enclosing schema annotation is its own
meta-validation root. Invalidity propagates through actual intrinsic parents and
captured references, never a merely physical schema ancestor. Permitted legacy
boolean fields remain valid at their owner; a standalone reference to such a
field receives a located family-specific target diagnostic.

`schema_resource_views.ts` extends the existing typed evaluator projection where
one physical resource has independent executable contexts or schema/literal
uses. Bounded private resource views materialize each captured schema once and
retain canonical edges, resource transitions, dialects and dynamic anchors using
the pinned evaluator's public Document/Reference API. Literal annotations are
restored without preprocessing; exact numbers resolve to original CST nodes.
Private executable coordinates are internal. Ordinary captures keep their
existing projection. No dependency source or contract bytes are changed.
External fragments keep the OAS default unless their own schema declaration
selects another dialect; an entry's `jsonSchemaDialect` does not leak into them
(O31 §4.8.24.5 / O32 §4.24.7).

Migration Markdown capture distinguishes schema and native rendering owners.
Reference fields carry the chosen parent interpretation through scalar navigation;
Design/Reference retire previous-role controls while a new role loads. Execution
and operation inheritance select their established operation/Path Item roles.
Registered `test_schema_resource_views` and extended schema-role coverage prepare
official dynamic-reference/unevaluated cases, literal exact values, invalid
independent schemas, discovery order and declaration-boundary negative controls.
Core `migration_schema_resource_context_test.dart` prepares captured unsaved
inputs, real HTTP bytes, scalar documentation bases, safe publication, original
source deletion, relocated reopening and CLI checks. These are unexecuted.
Evaluator `1.18.0+52`, graph role rules `4` and migration producer `48` are
synchronized with Core/preflight, including obsolete-proof rejection. General
entry-dependent specialization and refactoring remain W2/W6 implementation work.

### Entry-dependent specialization closure

O31 §4.3.2 and O32 §4.1.2 distinguish independently interpreted uses; JC §§8–9
require their captured reference/resource contexts. `migration_documents.ts`
exposes actual context differences to the existing common owner allocator.
`migration_schema_uses.ts` propagates variants through typed containment and
resolved references to an owning entry. It stops at other declared documents,
retains cycles as references and creates only reachable semantic variants.
Schema, Header and other applicable native component uses share deterministic
reservations, edit budgets, selected-consumer repair and original CST provenance.
Different entry dialect defaults receive explicit captured schema declarations
where necessary. Detached source fragments retain their original literal bytes.

Every source entry receives static/implicit/dynamic connection proofs before
conversion; ordinary role/literal ownership composes with the entry variants.
Family conversion then uses the established routes and publication pipeline.
The registered entry-use suite prepares distinct 3.0/modern nullable behavior,
recursive references, forwarding chains, Headers, exact original fragments,
reproducible owners and cold graphs. Document-owner regressions now require
representable sibling assertions to convert, while unresolved dynamic bindings
remain located source failures. Core `migration_entry_uses_test.dart` prepares
captured unsaved changes, stale/cancelled publication, real HTTP request/response
bytes, original deletion, relocated roots and CLI checking. Coverage is prepared,
unexecuted. Migration producer `49` is synchronized with Core/preflight.

At that checkpoint, partial schema resources and native uses lacking an ordinary
component holder retained `migration.owners.entry-resource`. A01 above now supplies
standard typed holders for the missing modern native positions and routes their
intrinsic schemas through the common resource preparation. Remaining located
resource/destination refusals identify unfinished algorithms rather than normative
unrepresentability. Differing implicit namespace specializations and refactoring
also remain in W2/W6.

### Selected-entry semantic reachability

O31 §4.3 and O32 §4.1.2 retain separate entry namespaces and containing-document
semantics. The canonical graph keeps every parsed declaration, resource identity
and source role, and now captures bounded typed reachability for the selected
entry plus explicit maintenance seeds. Unrelated foreign branches do not acquire
the selected entry's validation/evaluation context. Active reference failures,
resource boundaries, duplicate identities and malformed schemas remain located.
Issue deduplication retains separate object/connection owners.

Native schema/meta/example/serialized-example, parameter, media, XML metadata,
security, server and relationship checks consume the canonical entry-use view.
Whole-source metadata remains available to authoring, migration and refactoring.
Migration captures actual entry uses and still validates every complete root
before conversion/publication; this does not exempt another root from validity.
Registered `test_entry_contexts` prepares mixed legacy/modern fragment behavior,
independent security names, known foreign resource identities, duplicate-ID
negative controls, explicit maintenance seeds and whole-project source refusal.
The entry-owner engine/Core HTTP/publication/CLI suites exercise the integration.
All coverage remains unexecuted. Evaluator `1.18.0+53`, graph role rules `5` and
migration producer `50` are synchronized with Core/preflight.

A single entry that actively substitutes legacy and modern schemas through the
same unversioned location still needs a per-occurrence dialect/resource proof;
its existing located incompatible-family restriction is retained. Partial-resource
variants, differing implicit namespaces and holder-less native variants also
remain concrete W2 implementation work.

### Entry-owned schema resource identities

JC §§8.2.1–8.2.3 and §9.3 require schema resources and dynamic call scopes to
survive ownership changes. The common allocator now reserves collision-checked
identities for whole schema resources copied into distinct entry owners,
including implicit boundaries. Nested resources, static targets and named dynamic
starting anchors retain their captured owners. Transitive static forwarding into
dynamic schemas requires a proved same-resource holder; a copied native object
is not automatically a schema boundary. Captured input values never include
another entry’s earlier planning edits.

Schema/API conversions, reference normalization and documentation relocation use
the canonical captured entry owners across every root. Detached historical data
keeps its exact CST rather than receiving schema or URI rewrites. Registered
`test_migration_resource_owners` uses unchanged official dynamic-reference cases,
YAML/JSON exact values, documentation bases, implicit boundaries, URI collisions
and cold reopening. Existing entry/Core publication/HTTP/CLI regressions include
identified resources; forwarding regression covers downstream dynamic scope.
Coverage is prepared, unexecuted. Current evaluator `1.18.0+54`, graph role rules
`6` and migration producer `53` agree across production admissions and prepared
obsolete-proof controls. W2/W3 remain partially implemented for the concrete
partial-resource/namespace and conversion gaps recorded above.

### Captured namespace ownership before conversion

O20 §§6.4.18.1–6.4.18.2.1, O31 §4.3.2 and O32 §§4.1.2/4.25 bind model names
and implicit connections in their entry contexts. The existing difference
capture now includes actual security/discriminator/link bindings, dynamic
candidate owners and Swagger named-model tables. These differences use the
same typed backward closure and allocator as family/dialect differences.
Swagger anonymous variants remain outside the friendly definition namespace;
conversion selects each dispatcher’s actual active entry table.

Entry variants precede ordinary role/literal copying. The latter now uses all
actual entry captures, shares equal contexts, and excludes dormant interpretations
from owner selection. A bounded follow-up entry pass and composed provenance
retain explicit resource-base transitions and every pre-conversion target proof.
Existing engine entry/discriminator suites prepare independent security/model
names, recursive dispatch, a foreign-only overlapping Header/schema role, exact
values, original fragment preservation and cold reopening. Core discriminator
coverage includes both captured roots, actual HTTP bodies, publication, deletion
of originals, relocation and CLI checking. Nothing has executed. Migration
producer `52` is synchronized with Core/preflight; W2/W3 remain partial for the
resource, cross-document and conversion gaps recorded in their rows.

### Partial modern schema resources and native schema fields

JC §§8.2–9.3 require independently interpreted schemas in one resource to keep
one anchor namespace and dynamic stack boundary. The common entry ownership
closure now includes the active members of a sensitive resource and their native
consumers. A captured whole resource is reused; an implicit non-schema dictionary
receives one neutral schema resource owner with bounded, deterministic `$defs`
material owners. Intrinsic schemas remain together, and recursive edges remain
references. Dynamic dependency capture uses a finite backward graph closure.

Header/media/other native schema fields reference their material schemas rather
than declaring a second anchor owner. Retired child coordinates cannot capture a
new wrapper reference; URI repairs and context proofs select the actual material
owner. Schema resource roots carry their captured dialect, including roots inside
native objects. Literal values, YAML aliases and detached source text retain their
original owners. The existing entry/resource-owner engine suites now prepare
partial and nested resources, dynamic overrides, exact numbers, native Header
validation, YAML aliases and cold reopening. Core entry tests prepare the same
partial Header/schema owners through HTTP, stale/cancelled review, publication,
relocation and CLI. All remain unexecuted. Migration producer `53` is synchronized
with Core/preflight. Cross-document namespace specialization, mixed legacy/modern
same-location contexts, refactoring and the listed W3 mappings remain unfinished.

### Foreign document uses and entered dynamic resources

O20 §6.4.7 and O31/O32 entry namespaces distinguish the interpretation of a
foreign document’s shared operation from its owning entry. The same ownership
closure now admits foreign document subtrees while keeping an entry’s own
intrinsic fields. Older Path Items and independently referenced Operations use
anonymous native fragments, preserving their original family. Captured Swagger
`consumes`/`produces` differences seed the closure before conversion. The existing
operation invariant and publication proofs remain mandatory.

JC §8.2.3.2 binds dynamic overrides across entered resources, including matching
anchors outside the immediate static path. Canonical entry capture now admits
those anchor schemas and their dependencies only after their resource context is
entered. Unentered identities and unrelated foreign failures remain separate.
Registered entry-context controls prepare valid/invalid dynamically callable
anchors; document-owner engine/Core regressions compare inherited media, security,
server choices, unchanged operation IDs, exact schemas, actual JSON/suffix-JSON
HTTP bodies, original preservation and relocated CLI reopening. None has run.
Current evaluator `1.18.0+55`, graph role rules `7` and migration producer `54`
are synchronized with Core/preflight and obsolete-proof controls. Mixed-family foreign ownership remains concrete W2 work; operation-name
connections are covered by the typed-owner materialization below.

### Typed owner relations and operation connections

O31 §4.8.20.2 and O32 §4.20.2 define the mutually exclusive Link name/URI
representations. The common allocator now retains typed entry/role owner
relations, including canonical source contexts and independently interpreted
parent roles. It retains multiple material interpretations instead of selecting
one arbitrarily; required unique connections retain bounded ambiguity/cycle
checks. Owned entry fields stay intrinsic while their containing objects and
foreign incoming consumers participate in the same closure.

When an operation acquires independent owners, affected Link names materialize
to their captured operation URIs after specialization. Public operation IDs stay
authored, ordinary unmodified names stay named, and only the connection’s owned
field changes. Source/target proofs recognize the equivalent Link representation
and retain exact target checks. Existing entry engine regressions prepare shared
security/discriminator/operation names, YAML alias data and ordinary patch
controls. Core coverage inspects actual navigation targets, native Link field
pages, request definitions, publication, original deletion and relocated CLI
reopening. All coverage is prepared, unexecuted. Migration producer `55` agrees
with Core/preflight; evaluator `1.18.0+55` and graph rules `7` are unchanged.

### Connected-entry capture and external-example ownership

O31 §4.3.1/§4.8.19 and O32 §4.1.2.1/§4.18 require complete document context
and actual Example Object ownership. Ordinary discovery now follows the selected
entry’s canonical uses. Explicit migration capture follows connected complete
entries and their own references/examples, excluding stale disconnected roots
and reference-looking payload data. Core uses the existing approved acquisition,
budget, cancellation, byte identity and coherent snapshot mechanisms, and admits
only the versioned engine discovery protocol. The native projection remains the
selected entry’s projection; CLI migration uses the same Core capture.

Migration relocates locators across all entry owners, with concrete Example
roles and document bases. Accepted ignored-body omissions recapture every entry
before conversion; detached schema data is not converted, and only proven
retired example locators can disappear without a copy. Existing engine/Core
suites prepare selected-versus-migration acquisition, secondary-only schemas and
exact external bytes, malformed discovery rejection, unsaved inputs, original
preservation, relocated HTTP requests and CLI reopening. Ignored-body coverage
prepares exact detached schema/locator preservation. Nothing has executed.
Evaluator `1.18.0+56`, external-example rules `2`, entry discovery rules `1` and
migration producer `58` agree across production admissions/prepared controls;
graph role rules remain `7`. W2/W3/W4 still retain their recorded source gaps.

Reviewed extract, definition move, new-file extraction, inline and rename now
reuse `MigrationSource` and the shared captured YAML token owner, following YAML 1.2.2
§3.2.2.2. Original ranges and expected bytes are checked before private ownership;
final edits and reviews address the original buffers. Definition reads during
inline use a private owned CST without changing the retained source definition.
Destination collections receive independent ownership before insertion, so their
literal alias consumers do not gain new members. No-op moves retain all tokens.
Rename relationships read logical alias occurrences without granting ordinary
mutation permission. The existing typed planner then owns affected definitions,
reference fields, required/dependency lists and security/configuration maps on
private CSTs. Final edits retain original source coordinates and all configured
root proofs; literal consumers keep their exact data. Combined required-list
edits select a captured containing-family context, including omission of the
last entry for restricted families. Ordinary writes still use
the unchanged shared-node predicate. Native component/property/response/schema
definition rename controls and captured form recovery use reviewed eligibility.
Existing role, literal, reference, resource, dialect, recursion and dynamic-scope
proofs remain in force. Native Design exposes these reviewed operations through
engine-provided eligibility; ordinary property controls retain their guards.
Existing registered engine/Core/widget copy suites prepare exact numeric and
literal-data preservation, Markdown relocation, anchored/aliased uses and member
keys, same-instance alias relationships, destination/configuration collections,
stale sources, cancel/recovery, Undo/Redo and cold reopening. These
changes and regressions are source-complete for this YAML ownership boundary,
unverified; W2 and W6 retain the other concrete gaps in their rows.

An explicit **Make this YAML occurrence independent…** review now makes aliased
native objects, collections and schemas independently editable without raw Source
changes. `refactoring_ownership.ts` reuses the same token owner, checks exact values
and compares canonical roles, entry uses, URI/resource identities, anchors and all
static/dynamic/implicit connections across configured roots. Existing incomplete
connections remain incomplete. Ordinary fields use engine-supplied shared-source
metadata and retain their guards until review is applied. The same Core snapshot,
publication, history and native stale-selection protections own this action.

The independent CLI's `refactor` review/apply command uses these Core plans for
component/property/schema-definition/response rename, extract/new-file extraction,
inline, definition move, object deletion, operation move and YAML independence.
File creation, movement, deletion and named-root removal now use the existing Core
file/configuration plans too. Stable review identities include complete source
snapshots, configuration, approved boundaries, captured external resources, engine
assets, actual edits and every reviewed output/decision; process-local counters
are excluded only at known protocol coordinates. Created content, BOMs, permission
modes, destinations and presence changes have explicit immutable file intents.
Raw UTF-8 content inputs join the captured snapshot and freshness owner; file
creation captures configuration, approved boundaries and the actual engine asset
identity even in a new CLI process. Apply recollects
inputs and requires the supplied identity before changing buffers, then uses the
existing journaled grouped publication. Partial publication and cancellation do
not claim success or contract validation. Publication selects the Core transaction's
affected owners, including moves/deletions with no text edits. Registered engine ownership,
Core/CLI `yaml_ownership_test.dart` and native widget `yaml_ownership_test.dart`
prepare draft editing, exact numbers/bytes, incomplete and recursive references,
multiple roots, review/cancel, stale inputs, Undo/Redo, publication and cold reopen.
Core/CLI `refactoring_cli_test.dart` additionally prepares changed output/mode/BOM
reviews, captured-template and unopened-configuration freshness, zero-edit file
publication, exact bytes/modes, collisions, referenced-file refusal, new-file
extraction/relocation, cross-root operation Links, root declaration removal and
cold reopening. These CLI routes are source-complete, unverified; the W6/W7 rows
retain their other source gaps and mandatory execution remains held.

Mixed-family connected entries now select a compatible component holder from
this same owner allocator: the selected entry when its family matches, otherwise
the captured containing document. Entry namespaces, authored family/dialect and
physical holder no longer have to coincide (O31 §4.3.2–§4.3.3, O32 §4.1.2).
Partial modern resources use that holder too, retaining a single independently
identified material resource. Existing typed consumer, URI, binding, dynamic,
provenance and publication proofs remain mandatory. A01 above adds holders for
foreign native objects lacking a direct component map. Swagger model registries and
containers without an established independent ownership proof retain precise
implementation refusals. Registered engine/Core entry-owner suites prepare YAML/JSON upgrades
and downgrades, shared Header/schema bindings, partial recursive dynamic scopes,
exact numbers/HTTP bodies, literal aliases, unsaved/stale/cancelled captures,
original preservation, publication, relocation and cold CLI reopening. Migration
producer `58` is synchronized with Core/preflight and previous-producer rejection;
evaluator `1.18.0+56` is unchanged. These source changes and regressions have not
executed; W2/W3 remain partial for their other recorded gaps.

Before entry-owner allocation, affected annotation-only Schema views of
component maps and whole documents now receive owners from the existing role
allocator. This boundary
covers schemas containing only unknown keywords; recognition uses the captured
trusted dialect (JC §4.3.1). Only needed ancestors are selected; copying uses their immutable captured CSTs and
all active typed reference contexts. Independent schema/literal data is not
rewritten into native variants. The same reservation, source provenance,
context, URI and consumer proofs govern these owners, including compatible
foreign holders. Ordinary overlapping views containing only unknown keywords
use a compatible containing-document map in every entry, removing processing
order from their family selection. Other assertion/resource/container interpretations retain
located implementation guards. Existing engine/Core entry suites prepare
same-family and mixed-family map/document views, exact unknown annotation
values, references, native discriminator/security/Link bindings, whole-document
views without entry binding differences, HTTP behavior,
stale/cancelled reviews, original preservation, publication and cold reopening.
Ownership regressions use required discriminator properties and actual allOf
model inheritance (O30/O31 Discriminator clauses; O32 §4.25), including recursive
samples. This keeps source validity separate from namespace and annotation
preservation, without relaxing production composition/default diagnostics.
Migration producer `58` agrees with Core/preflight and obsolete-response controls;
evaluator `1.18.0+56` is unchanged. This ownership boundary is source-complete,
unverified; W2/W3 retain their other concrete source gaps.

Allocation-container Schema views retain assertions through this same owner
relation. A map with polymorphic connections receives an unnamed `$defs` owner
inside a captured schema resource. Entry copies use the existing neutral resource
holder, so a map never acquires a new discriminator model name. A map without an
existing ordinary schema can receive a neutral `$defs` holder in its native
document only when family, dialect and resource base remain identical and the
copy preserves the captured ownership of anchors and resource identities. Downstream dynamic calls can
retain that same implicit resource. Existing `$defs` maps with independent
interpretations are excluded from ordinary holder insertion. The bounded closure includes intrinsic containment, static references and dynamic
candidates; physical annotation children never
become semantic edges. Existing model and resource-identity
proofs still guard other cases; independently identified children without a
faithful retained owner remain a located implementation refusal. Native Schema
map members that are also applicator children retain one executable context when their family, dialect and
resource identities agree. The graph records every intrinsic parent edge while
retaining the native root's independent meta-validation boundary. A conflicting
root/subschema `$schema` use receives a located context diagnostic. Executable
Schema-map views, evaluation dependencies, migration sensitivity and reviewed
YAML proofs all consume this canonical relation.

Identified/anchored children that remain in actual native schema positions now retain
their material owners. The same allocator replaces their copied occurrences with
typed references and retires the copied child fields/identities from provenance;
native slot forwarding uses this same primitive. Native containment is proved
from the published document root, not inferred from a physical prefix or from
the existence of a secondary Schema scope. This path requires the containing
family, dialect, implicit resource and base to remain identical, and does not
copy their resource IDs or anchors. Secondary-only resources/anchors move with
the independently owned Schema view, while their original native annotation
bytes remain literal. All incoming typed references use the mapped view; canonical
recapture still rejects any resource or anchor that another active consumer
would retain ambiguously. The original or relocated resource and its recursive dynamic
candidates remain material. JC §§7.1, 8.2, 9.2–9.3 govern that resource/reference
preservation; O32 §4.25 still governs independent discriminator metadata.
Conflicting literal/native holders and other unproved resource contexts retain
their specific implementation guards.

Existing registered engine resource-view and entry-owner suites now prepare
positive/negative equal-context, independently identified dialect, unavailable
child, exact-number and assertion-preservation cases, including Draft 4/3.0
exclusive bounds through actual response-schema references. Core mixed-entry journeys
also evaluate dictionary assertions and actual HTTP bytes before migration and
after original-file deletion, relocation and cold reopening; CLI checks share
that saved output. Evaluator `1.18.0+57`, graph role rules `8` and migration
producer `64` agree across production admissions and obsolete-proof controls.
The registered entry suite also compares dynamic and static polymorphic maps,
implicit selector targets, neutral holders without an existing schema, literal
annotations, retained native children, secondary-only resource/anchor ownership
and recursive dynamic candidates with/without explicit resource IDs. Native inspection, dictionary
HTTP responses, migration publication, relocated reopening and CLI checks share
the Core mixed-entry journey. All coverage remains prepared, unexecuted.
This common ownership boundary is source-complete, unverified; W2/W3 retain the
other implementation gaps in their rows.

Entry/role connection proofs now project through the common material-owner
index before following CST conversion coordinates. Repeated refinements of one
captured use compose within its namespace; admitting an older captured role
cannot reverse that refinement. Static/dynamic references, implicit connections
and dynamic candidates retain their entry-qualified provenance through every
conversion stage and delivered-file relocation. Resource-context proofs require
the terminal owner in that specific entry, with captured family/dialect/base
transitions; another entry's matching copy is insufficient. An owning document's
secondary Schema interpretation may specialize while its native fields retain
their owners. Copied Schema-map applicators use the same material-slot forwarding
as copied native objects when their children have separate owners.

The allocator retires superseded anonymous preparation schemas only when no
terminal typed owner, external reference/dynamic candidate, literal owner or
declared schema identity would be removed. Internal self-cycles alone do not
retain an obsolete preparation copy. Authored definitions and identified resources
remain protected. This keeps unused intermediate discriminator models from
becoming invalid after their real consumers acquire entry owners. JC §§7–9 and
O32 §§4.1.2/4.25 govern these scoped reference and connection rules.

Registered `test_migration_entry_connections.cjs` and Core
`migration_entry_connections_test.dart` prepare YAML/JSON, two entry namespaces,
owning-entry secondary roles, recursive map assertions, different default
discriminator targets, unchanged native annotations/exact values, native field
inspection and actual HTTP responses. Core covers captured unsaved inputs,
stale/cancelled publication, preserved originals, relocation, deletion of source
files and CLI cold reopening. Migration producer `68` is synchronized with
Core/preflight and obsolete-proof controls. Coverage is prepared, unexecuted;
other incompatible holder/identity/refactoring cases remain W2 source gaps.

Shared Markdown scalar specialization now uses `MigrationSource.own` and the
same captured YAML token owner as schema/native specialization and reviewed
refactoring; the independent alias-expansion algorithm has been removed.
CommonMark destination/AST proofs are unchanged. The complete exact-value
projection permits only requested logical strings to change, and shared text
retains bounded token/edit/byte work. No-op strings keep their original aliases.
Existing registered shared-text and Core publication suites retain patch-family,
key-anchor, repeated-anchor-name, block/comment, alias-collection, exact-number,
unsaved/stale/cancelled and cold-reopen coverage. A focused production migration
case additionally prepares simultaneous native and schema description changes
with stable/relocated rendering bases, key aliases and literal data. This common
YAML text boundary is source-complete, unverified; independently conflicting
semantic rendering contexts still require the W2/W6 closure recorded above.

That same entry-qualified provenance now includes rendered descriptions and
passive URI fields, including native Example external locators. Markdown capture
uses each actual entry/role graph and rendering base; rewriting and delivered
proofs follow its qualified material fields. Explicit CST transfers can change
the description's object kind, including Swagger form parameters becoming schema
properties, when the resulting field has an actual rich-text capability. Literal
annotation/data copies retain their values. External-example capture retains
entry namespaces and native owners before byte lookup, then publishes through
those same field projections without an invented media interpretation.

Superseded native-object preparation copies use the common retirement guards
too. Declared schema IDs/anchors are recorded before copied descendants can become
dormant, so a later graph cannot mistake an unindexed identity for disposable
data. Potential ambiguous targets also retain their owners. Authored source and
captured byte identities stay protected. Source validity is checked before
initializing the qualified provenance projection.

Existing registered shared-text/external-example suites prepare native-to-schema
description transfers and shared Example/Schema roles in mixed modern entries.
Core `migration_semantic_fields_test.dart` prepares native example choices,
number-versus-string occurrence media, literal inspection, actual HTTP bytes,
original preservation, byte publication, original deletion, relocated reopening
and independent CLI checks. Migration producer `68` agrees across production
admissions and obsolete controls; evaluator `1.18.0+57` and mock producers remain
unchanged. These paths remain unverified, and W2/W3/W4/W6 retain their other source
gaps.

Modern discriminator-sensitive whole resources and boolean choices now use
the same neutral `$defs` holders as shared map interpretations. Object roots
carry their owned resource IDs; boolean values inherit identity and dialect
from their holder without acquiring object keywords. Selected intrinsic Schema
ancestors already own embedded resources, avoiding redundant empty holders.
Compatible foreign native maps also own model-independent literal Schema views;
their captured family is retained independently of the selected entry. An
independent root dialect is declared on a neutral holder where required.
Insertion retains the common literal/role guards and admits a destination's
Schema interpretation only with its captured material copy.

Registered `test_migration_model_resources.cjs` prepares source/target assertions,
native discriminator selection, distinct entry bindings, embedded identities,
boolean alternatives, recursive dynamic candidates, deterministic output and
exact literal preservation. Core `migration_model_resources_test.dart` prepares
native inspection/choices, actual HTTP responses, original-file preservation,
publication, original deletion, relocated reopening and CLI checks. Migration
producer `65` is synchronized with Core/preflight and obsolete-proof controls.
These paths are source-complete, unverified; the other W2/W3 source gaps remain.

Restricted Swagger/OpenAPI 3.0 Schema views now use the common allocator's
anonymous array-item layout when a compatible native map is needed. The reserved
wrapper is an array with one Schema Object in `items`; consumers address that
item directly. It introduces neither a property interpretation nor an `allOf`
model name. Copy provenance, entry-qualified reference repair and literal guards
remain shared with modern holders. Retirement checks the whole reserved wrapper
and removes it together with an obsolete copied item, retaining terminal owners,
external consumers, possible targets and declared identities.

Owning-entry literal Schema uses now participate in the same independent-owner
closure as secondary native roles. Ordinary modern allOf discriminator name
tables seed that closure alongside explicit mapping fields; different entry
namespaces receive independent models without adding assertion constraints or
invented mapping entries. Schema Reference siblings and adjacent unions retain
their existing captured edges.

The registered model-resource engine suite prepares mixed Swagger/modern and
3.0/modern literal ownership, recursive references, entry-specific explicit and
implicit model names, source/target evaluations, exact data and deterministic
output. Core `migration_restricted_model_owners_test.dart` prepares native choices,
exact numeric HTTP bytes, cancellation, original preservation, safe publication,
original deletion, relocated reopening and CLI checks. Migration producer `68`
is synchronized; evaluator/mock declarations are unchanged. This holder and
entry-selection boundary is source-complete, unverified. W2/W3 retain the other
concrete resource, direction and refactoring gaps in their rows.

Conditional migration now proves annotation-free boolean/empty conditions and
fixed static/dynamic reference chains without an instance search. It applies only
the selected branch through `allOf`, retaining the converted condition and any
independently consumed inactive schema through the common allocator. Inactive,
unconsumed branches are removed before child-vocabulary conversion, including
both branches when `if` is absent. Internal static recursion is not an outside
consumer; captured implicit connections, dynamic scopes, candidate targets and
literal/role guards remain protected. Nonconstant Swagger conditions retain a
specific implementation blocker; partial inactive-subtree extraction remains
separate source work rather than an unrepresentability claim.

The registered conditional engine suite prepares both restricted targets,
independent condition/branch evaluation, recursive schemas, exact numbers,
fixed dynamic-reference lowering, literal preservation and an independently
consumed inactive-assertion refusal. Core `migration_constant_conditions_test.dart`
prepares native schema inspection, actual request/response bytes, cancellation,
original preservation, publication, original deletion, relocated reopening and
CLI checks. Migration producer `68` is synchronized; these paths remain
unverified and W3.03 remains partially implemented.

Finite property-name domains now support `patternProperties` conversion in both
restricted families. The name-domain proof is shared with property-name lowering.
Each pattern's converted value schema has one common anonymous array-item owner;
matching-name branches apply all overlapping assertions. Empty properties in the
original object preserve the original additional-property exclusions without
changing existing value schemas. Regex matching uses the exact pinned evaluator's
Unicode mode, within bounded input/output work and the existing cancellable
request deadline. Unconsumed zero-match schemas retire before vocabulary
conversion; independently consumed values and source literal aliases survive.
Empty pattern maps lower without a finite domain. Unbounded domains retain their
specific implementation blocker.

Conditional and property-name retirement now use the same bounded consumer query
in `MigrationSchemaOwners`, supplied with all captured entry references rather
than one namespace's graph. Copying and moving anonymous restricted owners share
one storage primitive. Definition and conditional owners remain anonymous too.
Converters select the actual captured entry/role/resource context; common moves
preserve passive URI bases before transferring the CST. Entry-specific hoists
retain their native namespace, and stage reference repair now includes native
discriminator targets before validation. Wire keys named `$ref` or `$dynamicRef`
remain discriminator values. Unchanged spellings are proved against actual
entry captures rather than dormant interpretations in the first graph. Registered `test_migration_patterns.cjs` prepares YAML
anchors, JSON, both targets, overlapping patterns, additional-property schemas
and false values, recursion, independent references, exact numbers, Unicode,
terminal newlines, special member names, source preservation and cold evaluation.
Core `migration_patterns_test.dart` prepares native properties/constraints,
external schema fragments and documentation URI bases, actual HTTP request/
response bytes, cancellation, original preservation, publication, original
deletion, relocated reopening and CLI checks. Engine controls additionally
prepare foreign entry namespaces and discriminator URI targets in moved
schema definitions, including reference-looking wire keys. Migration
producer `68` is synchronized; no evaluator, mock or dependency revision changed.
These mappings remain unverified; W3.06 retains its other source gaps.

## Required functionality still open

- W3.01's directional ownership/downgrade mappings are source-complete and
  unverified within B01 above; current-revision execution remains held.
- Shared schema/literal ownership and incompatible entry contexts, including
  discriminator specialization and independently interpreted Markdown uses.
- Mixed or constrained binary contexts, opaque content, file unions and reusable
  media lacking sufficient occurrence context.
- Remaining typed/dynamic, nested and positional multipart, parameter/header
  representations and incremental streams.
- CONNECT behavior and remaining bounded response-witness generation.
- Remaining URI-preserving inline, copy and relocation mappings and named-schema
  maintenance positions.
- The explicit W1.01–W1.14 clause/surface coverage above, including 3.2 document
  identity and URI bases; exact query/additional method spelling; querystring;
  reusable media/item schemas and encoding/example fields; tag parent metadata;
  security URI/OAuth additions; XML node types and discriminator defaults.
  W2.01–W2.02 track independent schema/literal identity ownership separately.

A missing implementation is not an unrepresentable conversion. Migration must
retain source-located blockers until a faithful mapping is implemented. It must
preserve originals, reject stale reviews, expose decisions and validate delivered
outputs under the target family's rules. Valid output alone does not establish
behavioral equivalence.

Regression coverage includes production entry points, YAML/JSON, published
patches, exact bytes and numbers, invalid inputs, unavailable resources,
cancellation, stale captures, source preservation and publication failures.
Current full-suite, native and packaged acceptance remains incomplete.
Directional regressions are in `test_migration_direction.cjs` and
`test_migration_access.cjs` through `planMigration` and native schema evaluation.
Core access and derived-resource regressions cover captured ownership,
publication, cancellation, stale inputs and package/CLI reopen; the widget review
regression uses the existing controls and localized fallback selection. These additions have not been executed.
Their authorities are Swagger 2.0 §6.4.18, OpenAPI 3.0.4 §§4.7.24–4.7.25 and
the OpenAPI 3.2.1 Discriminator Object.

Document-identity regressions use `test_migration_identity.cjs` through native
planning, structural analysis and schema evaluation. They cover both 3.2 patches,
YAML/JSON, direct and composed downgrades, nested resource IDs, dynamic anchors,
cross-document references, moved files, exact values and missing resources.
The external-example regression retains exact byte and defining-base checks;
Core identity tests add unsaved inputs, cancellation, stale reviews and standalone
reopen. These additions have not been executed. The URI authority is
[OpenAPI 3.2.1 §§4.1.1–4.1.2 and 4.5.2](https://spec.openapis.org/oas/v3.2.1.html#relative-references-in-api-description-uris),
together with RFC 3986 and JSON Schema Core resource and reference rules.

Fallback selection uses the shared `discriminator_alternatives.ts` graph
projection and `schema_sample_candidates.ts` suggestion construction. The native
schema evaluator proves each candidate against the alternative and complete
parent. Missing discriminator decisions remain pending specification metadata;
this partial instance proof is not a complete validation result. Other
incomplete evaluation blocks selection, and publication still requires full
target validation. Core validates choice labels and captured source ranges; the
existing native review uses localized labels. The normative authority is the
[3.2.1 Discriminator Object](https://spec.openapis.org/oas/v3.2.1.html#discriminator-object).
`test_migration_discriminator_defaults.cjs`, Core fallback-decision tests and the
existing widget review cover target identity, accepted/rejected payloads, exact
numbers, stale choices, cancellation and malformed review metadata. These changes
and regressions are implemented but unverified. The discriminator producer
regression now checks `discriminator-models-v2` and production mock rejection of
obsolete `swagger-discriminator-models-v1` proofs; those tests have not run.

Fallback migration fixtures distinguish the families' discriminator rules.
The optional-property 3.0.4 cases remain negative validation/publication tests;
valid 3.0.4 upgrades keep the property required and add no fallback decision.
Positive optional fallback reviews use 3.1.2, whose absent-property selection
behavior is undefined until the user chooses the 3.2 fallback. Engine and Core
cases cover YAML/JSON and oneOf/anyOf/allOf, selected target identity and behavior,
unchanged originals, stale decisions and publication refusal. Production 3.0
validation is unchanged. These corrected and added regressions have not run.

Native `defaultMapping` checks distinguish ineligible targets from unavailable
inheritance context. Metadata errors do not change JSON Schema instance
validation. The existing Design reference picker and Source completions use the
same composition selector, with per-root checks before a reviewed edit.
`test_discriminator_alternatives.cjs` and Core selection regressions cover
aliases, reference siblings, external/escaped targets, dynamic contexts,
unsupported dialects, exact source preservation, Undo/Redo, cancellation, stale
captures and cold reopen. These regressions have not run. Three older valid
controls used unrelated fallback schemas; they now use listed alternatives or
actual allOf descendants, as required by the normative Discriminator Object.

Shared Markdown migration retains logical description provenance through YAML
aliases. `migration_shared_text.ts` prepares localized replacements only in the
migration copy, insulates alias consumers before changing a definition, and
compares the entire exact data projection against the requested string changes.
Alias expansions and presentation changes appear in the existing review.
Ordinary editing retains its shared-node guards. A single occurrence interpreted
as both literal data and rendered contract text remains an ownership gap.
`test_migration_shared_text.cjs`, existing Markdown identity/location regressions
and Core publication tests cover scalar/collection/key anchors, repeated names,
virtual descendants, different bases, exact numbers, literal payloads, unsaved
source, cancellation, stale reviews and cold reopen. The old shared-Markdown
refusal controls now require successful mapping plus unchanged literal values.
These changes and tests are implemented but unverified. Migration producer 40
is admitted consistently by engine, Core and native preflight; the permanent
cross-component consistency regression remains active.

Migration YAML ownership is handled by `migration_yaml_ownership.ts` through
`MigrationSource`, including schema copies, required-presence lowering, ignored
body omissions, document identities, declarations and reference relocation.
It removes only captured anchor-property tokens and expands only affected
alias-value tokens, then proves the entire exact data projection unchanged
before the intended conversion. Bindings follow actual captured node identities,
including reused names and key anchors. Logical alias provenance survives schema
hoisting and multi-file copies. Other literal consumers and untouched aliases
retain their values; restructuring is visible in the existing review.

Source capture uses the same public Parser/Composer as the pinned yaml 2.9.0
`parseDocument` implementation, retaining property tokens during its single
parse. The exact dependency source is `yaml/dist/public-api.js` and the
[2.9.0 public API](https://github.com/eemeli/yaml/blob/v2.9.0/src/public-api.ts);
the existing MIT dependency attribution is unchanged. No third-party source or
dependency version changed. `test_yaml_source_ownership.cjs` compares captured
parsing with that pinned API, including invalid documents and ordinary shared
edit refusals. `test_migration_alias_specialization.cjs` and the existing YAML,
direction, required-presence, identity, ignored-body and server regressions cover
source-preserving alias separation, exact numbers, literal consumers, recursive
references, composed upgrades and faithful downgrade cases. Core tests cover
unsaved models, cancellation, stale reviews, publication and reopen. Previously
blocked representable alias cases now require successful conversion plus actual
behavior and unchanged-data assertions. These changes have not been executed.

Subtree ownership also includes descendant alias tokens whose definitions lie
outside that subtree. Those values expand only in the planning copy; outside
anchor definitions and their other consumers remain unchanged. This corrects
the representable Swagger downgrade of a schema with `type: *kind` bound to a
root extension's `&kind string`, while retaining `assertUnshared()` and the
whole-document exact-data check. `test_migration_descendant_aliases.cjs` covers
all published 3.0–3.2 patches with YAML/JSON controls, scalar/collection aliases,
reused anchor names, exact numbers, unchanged literal consumers, reference
repairs, instance behavior, cross-file schema copies and declaration-only
upgrades. Core tests prepare unsaved captures, cancellation, stale reviews,
publication and cold reopen. The correction is implemented but unverified;
these regressions and the compiler/build gates have not run.

Swagger downgrade removes only inactive false `writeOnly` and `deprecated`
Schema Object annotations, preserving effective defaults and accepted request/
response values. Active annotations retain their existing blockers. A modern
false annotation referenced independently as a schema is moved to a standard
definition using the shared restricted boolean-schema mapping; source provenance,
references and namespace collisions remain explicit. The authorities are OpenAPI
3.0.4 §4.7.24.2 and JSON Schema Validation 2020-12 §§9.3–9.4.
`test_migration_inactive_annotations.cjs` covers every published 3.0–3.2 patch,
YAML/JSON, request/response evaluations, exact numbers and empty values, aliased
literal consumers, independent false schemas, naming collisions and active-rule
refusals. Core regressions cover unsaved captures, cancellation, stale publication
and native Swagger reopen. These source changes and regressions have not run.

Boolean `additionalProperties` fields retain their values during modern-to-3.0
and modern-to-Swagger downgrades. Captured independent schema references receive
separate standard definitions with equivalent object assertions. The unchanged
field remains owned by its containing object, while schema-reference provenance
selects the generated definition. Names are deterministic and collision-safe;
normal named schemas called `additionalProperties` use ordinary schema rules.
The authorities are OpenAPI 3.0.4 §4.7.24.1, Swagger 2.0 §6.4.18 and JSON Schema
Core 2020-12 §4.3.2. `test_migration_boolean_owners.cjs` covers all published
3.1/3.2 patches, YAML/JSON, both boolean values, standalone and cross-file
consumers, chained references, accepted/rejected request/response instances,
exact numbers, aliases, literal values, collisions and missing resources.
Core regressions cover unsaved external captures, cancellation, stale reviews,
publication and cold reopen. These changes and tests have not run. Remaining
independent literal/contract ownership gaps are separate from this mapping.

Numeric witness construction reads canonical numeric values in both YAML and
JSON rather than requiring JSON's CST node kind. It uses the existing exact
decimal owner for bound comparison and bounded integer-lattice arithmetic for
multiple constraints. Suggestions never authorize a response: native evaluation
proves the whole original schema. Generated output for a valid mock request is
withheld when its final response proof is invalid or incomplete; validation
proxies retain their response-byte and error policies. The sample producer is
revision 3, admitted consistently by Core and the existing readiness tests.
`test_mock_numeric_candidates.cjs` and Core/packaged CLI regressions cover exact
wire bytes, strict bounds in each family, fractions, composed constraints,
overflow/underflow, external schemas, impossible numeric cases, captured unsaved
buffers, cancellation and stale plans. These changes have not been executed.

Flutter 3.47.5/Dart 3.13.4 and the existing framework/engine revisions are
unchanged. `tools/flutter_sdk.lock.json` pins the
[official Linux release catalog](https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json)
and the SDK, Linux debug/profile/release engine and Dart archive identities from
their published attestation subjects. The
[3.47.5 SDK attestation](https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.47.5-stable.tar.xz.intoto.jsonl)
agrees with the catalog's archive SHA-256. This establishes expected archive
identities, not the authenticity of a selected local binary or cryptographic
verification of attestation signatures. The verifier requires an independently
established member pin or reads the original ZIP only after its complete hash
matches that pin. Installed checks reject self-hash-only receipts and forged
library/receipt pairs. No SDK acquisition or replacement occurs in this path.
`tools/test_flutter_sdk.py` adds owned-fixture regressions for absent/modified
archives, forged receipts and existing-SDK verification. Those tests and actual
binary comparison have not run; native and packaged acceptance remain open.


Native URI connections now retain their typed interpretation when mapping/member
names are `$ref`, `$dynamicRef` or `operationRef`. Discriminator metadata uses
static URI identity (OAS 3.2.1 §4.25); genuine Schema applicators retain dynamic
scope. Friendly model names remain names. Security Requirement URI keys (§4.30)
are relocated independently, with distinct ordered role/scope arrays preserved
even when multiple spellings select the same scheme. Canonical choices, source
navigation, file/definition relocation, bundling and migration share that rule.
Final normalization and portable key repairs compose the existing qualified CST
provenance, retaining source/target connection proofs through cold publication.

Registered `test_native_connection_keys.cjs` prepares YAML/JSON native navigation,
static-versus-dynamic controls, model relocation/bundling, all directed family
routes for keyword-shaped security names and independent URI key arrays. Core
`migration_native_connection_keys_test.dart` prepares native inspection, original
constraint evaluation, exact HTTP bytes and security, cancellation, preserved
originals, relocated publication and cold CLI reopening. These tests have not
run. Evaluator `1.18.0+58`, graph role rules `9` and migration producer `69` are
synchronized with Core admission and preflight. This closes the identified
native-connection keyword confusion; W2/W3/W6 retain their other recorded source
gaps and acceptance remains held.


Local unevaluated selections now lower to `additionalProperties`/`items` using
the source annotation rules (JC §§10.3, 11.2–3). Explicit additional-property or
item coverage and constant all-item containment make the corresponding
unevaluated assertion inactive. Type exclusions also prove inactivity. Only
unconsumed, unidentified inactive children retire before vocabulary conversion;
independent children use the existing anonymous owner allocator. The common
consumer query now protects declared IDs/anchors without requiring an incoming
reference. Composition-dependent coverage keeps its located implementation
blocker instead of a guessed additional-property constraint.

Tuple conversion retains the original unevaluated-tail value and provenance:
finite constrained tails use one anonymous material owner, false tails close
the array, and independent tail references survive. Registered engine coverage
compares source/target constraints, retained official unevaluated-property
oracles, YAML aliases, recursive/exact values, finite pattern interactions,
independent subschemas, unknown coverage and identified inactive assertions.
The existing Core array journey now prepares native object/item inspection,
actual POST/response bytes, original constraints, cancellation, unsaved inputs,
publication, original deletion, relocation and CLI reopening for those mappings.
Migration producer `70` agrees across engine/Core/preflight and obsolete controls;
evaluator `1.18.0+58` and mock producers are unchanged. Coverage is prepared, not
executed. W3.02/W3.06 remain partial for their other recorded mappings.


The W4.07 native request-body boundary now uses the existing captured external
resource owner instead of requiring a Unicode text projection. A sealed Core
selection binds project, operation, media occurrence, plan/snapshot and byte
identity. Preparation verifies current resources and cancellation before using
those immutable bytes. It retains the declared content type and existing upload,
TRACE, original-schema and codec checks. Native controls show the selected
resource, preserve unchanged draft selections through exact owner proofs, and
provide an explicit text choice. They never create a file picker grant or infer
a schema branch/media type.

Saved cases select the same occurrence with `body.externalExample`, mutually
exclusive with `body.value` even when the value is null. The CLI uses that same
Core preparation and original-schema evaluation. Unavailable/ambiguous choices
remain incomplete; changed resource/protocol inputs are runtime failures rather
than successful validation. Existing preparation-refusal exit semantics remain
unchanged. Core `external_body_examples_test.dart` prepares actual binary/empty
HTTP bytes and responses across 3.0/3.1/3.2, unchanged restoration, owner/resource
staleness, cancellation, unavailable resources, ambiguous configuration and CLI
cases. Native `external_body_example_request_test.dart` prepares real example
controls, byte exchange, stale rejection, explicit text choice and source
preservation. Both register through the established Core/widget gates. They
have not executed. Evaluator `1.18.0+58`, migration `70` and mock `4` declarations
are unchanged: this increment consumes existing captured engine projections.
W4.07 remains partial for its other concrete native/parameter/mock consumers;
this request-body selection boundary is source-complete, unverified.


Captured external examples now survive the mock child boundary as validated
packets, including approved aliases, byte identity and unavailable conditions.
Selection uses the original Example Object occurrence and captured URI base.
The existing generator adapter retains the pinned status/media/example
negotiation and supplies a request-owned placeholder only to the unmodified
third-party mocker. That placeholder is never emitted: the existing exact-byte
response path retains binary, empty, charset-specific and exact JSON entities.
Every applicable emitted response still undergoes original captured-schema,
media, status and Header validation. Unsupported or invalid witnesses retain
the existing refusal. No external URI is fetched by the mock child.

Registered `test_mock_external_examples.cjs` prepares cross-file YAML/JSON
examples, approved aliases, default/named selection, actual binary/empty/Latin1/
exact-JSON HTTP bytes and startup refusals for absent, denied or corrupt packets.
The Core external-body journey now also prepares stale-start rejection and
real native mock byte exchanges across applicable families. Mock response
producer `5` and `response-wire-v5` agree across engine, Core and readiness
controls; parameter producer `4`, numeric sample producer `3`, evaluator
`1.18.0+58` and migration `70` remain unchanged. The shared engine mock fixture's
obsolete response/parameter revision-3 expectations were reconciled with these
production declarations. No tests have run. This closes the captured external
response-byte boundary; W4/W5 retain their other recorded source gaps.


## URI Security Requirement downgrade continuation

OpenAPI 3.2.1 §4.30 remains the authority for entry-component-name precedence,
URI binding identity, ordered OR alternatives and the independent AND bindings
inside each requirement. `migration_security.ts` now uses the existing
`MigrationSchemaOwners` reservation/copy boundary for URI-to-name mappings.
Additional material uses retain the same typed field/target provenance used by
Markdown, connection and request proofs; they do not replace canonical owners.
Source-side URI-key relocation and future-family Path Item holders use the same
entry-specialization closure. Security alias chains select the Security Scheme
role, preserve Reference Object descriptions when materialized, and retain
precise blockers for genuinely unavailable role/summary representations.

The captured configuration participates in migration decisions and review
identity. Existing environment declarations and secret references are retained
through `securityConfigurationCopies`; generated component names reserve
existing configuration and URI-key spellings too. Independent publication uses
exact, identity-checked manifest text, preserving exact configuration numbers.
TLS file declarations retain their original absolute locations without
acquiring or copying file bytes. No credential store is read by migration.
Core verifies original settings and generated aliases, keeps configuration in
its stale/publication capture, and the native review and CLI expose binding
spelling changes without credential values. Migration producer `71` is admitted
consistently by engine, Core, native preflight and regression assertions; the
previous native fixture's stale `25` assertion now names the current producer.

Prepared production regressions are `test_migration_security.cjs` (registered
in the engine gate), Core `migration_security_test.dart`, and the existing
native migration review journey extended with URI bindings. They cover target
and environment collisions, prevention of URI-key hijacking, aliases, external
resources, `$self`, distinct roles/scopes, shared entries, exact literals and
configuration numbers, unchanged originals, unsaved configuration, cancellation,
stale reviews, CLI review/apply, publication, actual HTTP secret-reference
resolution and cold reopening. No compiler, analyzer, test, build, generation,
native/graphical workload, package or acceptance gate has run. These source
changes remain unverified. W2/W3 and the full W1–W7 milestone remain partially
implemented; the remaining shared/mixed-family ownership, newer-field mappings
and all other concrete register gaps remain implementation work.


## OAuth flow and credential contribution continuation

Standard implicit, password, authorization-code and client-credentials OAuth
flows now lower to one-flow Swagger schemes through
`migration_security_flows.ts`. The existing allocator retains each independent
binding; `MigrationSource.expandArray` copies ordered requirement occurrences
with original CST coordinates. Distributive expansion preserves each AND term,
every OR alternative and distinct required scope arrays. Additional material
uses compose transitively, so URI binding variants can acquire flow variants
without losing captured targets or documentation provenance. Root and effective
operation security-array owners project environment selections through the
complete compatible branch sets. A single global setting that cannot retain
its original requirements across operations receives a located representation
blocker; out-of-range settings cannot become active through expansion. Native
review and CLI disclose changed selections using the existing Core snapshot
and publication boundary.

Scheme reference materialization now retains complete ignored Reference Object
occurrences as literal data through the same anonymous allocator. These copies
acquire no native connection role: ignored `$id`, URI-looking strings, legacy
descriptions and exact extension values remain literal. Anonymous holders
retain the source format, including YAML comments across differently formatted
entries. Applicable description overrides retain their own source coordinates
and Markdown bases. Recognized summaries without an older standard field,
non-OAuth roles in restricted families, unsupported grants/discovery schemes
and OAuth wrapper/flow extensions without a standard target container remain
precise blockers. Literal authentication headers remain in the original
configuration and are never copied into delivered settings. Existing
`accessTokenRef` and other supported credential references remain declarations;
migration reads no credential store or credential file bytes.

Core execution retains every binding and scope/role array while sharing a
generated credential field only when its wire representation, credential
reference and applicable public identity agree. This covers header/query/cookie
API keys and Basic/Bearer contributions. Explicit input collisions, distinct
references with coincidentally equal bytes/preview markers, differing Basic
usernames and invalid header names still block. Credential values are acquired
only by the existing request execution resolver. New byte-exchange regressions
exercise source and cold-published targets, all OAuth AND expansions and
unchanged original files/configuration; negative controls retain no-send and
collision assertions.

The shared request invariant owner now compares ordered flow alternatives and
effective refresh endpoints, normalizes case-insensitive HTTP scheme names,
and preserves literal OAuth scope/Server variable dictionary keys named
`source`, `definition` and similar projection metadata names. Prepared
production negative controls mutate valid delivered declarations and require
these differences to remain observable. The engine gate prepares that same
invariant owner as a test entry; no substitute proof implementation is used.
Migration producer `72` agrees across engine, Core, native preflight and all
current assertions; producer `71` is retained as an obsolete negative control.
Schema evaluator `1.18.0+58`, response/parameter mock producers `5`/`4`, numeric
sample producer `3`, dependencies and the installed Flutter SDK are unchanged.

Retained OpenAPI 3.2 URI bindings reserve authored and configured spellings
across requirement arrays and API roots before publication. The existing
canonical URI spelling prover supplies distinct equivalent dot-segment
spellings when independently configured OR bindings address one scheme;
settings and scope/role arrays do not collapse. Relocation carries each
connection's captured entry graph, so foreign-entry component-name precedence
is proved in its own namespace. Engine regression sources cover JSON/YAML,
declared `$self` and retrieval identities; Core byte-exchange regression
sources exercise different credential references across source and cold
publication after removal of the original files. Sequence expansion also
retains member-leading comments through the existing token copier.

Engine, Core, native review and CLI regression sources are prepared. No
compiler, analyzer, test, build, generation, graphical/native workload, CI,
performance or packaged acceptance has executed. These implementations remain
unverified. W2/W3 retain the other concrete source gaps in their existing rows;
W1–W7 are not SOURCE COMPLETE and no work package is ACCEPTED. The execution
hold does not close those remaining source requirements. Snapcraft remains
skipped.

## Shared binary forwarding ownership continuation

W2.02/W3.07 now specialize captured static OpenAPI 3.0 string/binary
forwarding chains when raw message bodies and JSON consumers share one
definition. The existing allocator places anonymous array-item schema owners
in compatible native component maps; original neutral definitions and
unrelated consumers stay intact. Selected raw occurrences acquire proved
references to their copied chains before the existing binary conversion runs.
Additional typed-use provenance, captured Markdown bases and final connection,
request and native cold-reopen invariants remain shared with ordinary migration.
No binary-specific ownership registry or credential/external-byte acquisition
was added.

Prepared engine regressions cover JSON/YAML, both modern destination families,
external alias chains, deterministic collisions, exact values, untouched
originals, raw octets including empty/non-Unicode payloads and invalid JSON
values. The existing constrained/mixed refusal retains all located no-output
assertions with an applicable length constraint. Prepared Core regression
coverage exercises unsaved review, publication, actual raw/JSON HTTP exchanges,
invalid outgoing/received values and cold opening after original-file removal.
Producer `73` is synchronized across engine, Core, preflight and current
assertions; obsolete producer `72` remains rejected. The execution hold remains
active; none of these checks has executed. Nested or independently targeted
occurrence splits, constrained raw mappings, file unions and the other register
gaps remain unfinished source work. W1–W7 are not SOURCE COMPLETE or ACCEPTED.

The same binary forwarding owner now follows captured direct multipart
property and array-item instance paths. Separate raw part references acquire
the shared material copies while JSON consumers keep their original string
assertions. The existing binary-use classifier supplies media/path meaning;
there is no independent multipart classifier. Prepared engine regressions
retain required membership and unrelated property validation alongside raw
octets and JSON type failures. Core/CLI regression sources now cover complete
bodies, named raw parts and repeated raw array-item parts through unsaved
review, real byte exchange, publication and cold opening. Raw inline definitions
that are independently targeted by JSON consumers now retain neutral string
copies before their raw occurrence changes.
Forwarded containing objects and composition-dependent occurrences still
require further source ownership algorithms. Native review regression sources
exercise a coordinated external binary/JSON definition through the same
reviewed source comparison and publication path. Producer `74` agrees across
current consumers and prepared assertions, with `73` added to obsolete-proof
negatives. All execution
remains suspended; these extensions remain unverified and the existing W2–W7
source gaps remain open.

## Equivalent conditional branch continuation

W3.03 now lowers identical exact `then`/`else` schemas with matching captured
resource contexts when the predicate contains only `type`, `enum` and `const`
assertions. These predicates collect no instance-location annotations; one
common branch preserves the selected assertions and annotations. The existing
material-owner allocator retains the predicate, active branch and independent
equivalent branch, with original CST coordinates and ordinary reference repair.
Predicates with conditional annotations remain located implementation blockers;
general nonconstant Swagger conditionals remain unfinished.

Prepared engine regressions cover JSON/YAML, both restricted targets, all
three predicate forms, exact numbers, independent references to every branch,
literal history, deterministic review and cold reopening. Core regression
sources retain existing constant cases and add equal branches through real
request/response bytes, cancellation, publication, cold relocation and CLI
checking. Native review regression sources expose the generated common-owner
changes in the source comparison. Migration producer `75` is consistent across
engine, Core, native preflight and prepared assertions; `74` is an obsolete
negative control. No compiler, analyzer, test, build, generation, native or
graphical workload, CI, performance check or packaged acceptance has executed.
The existing register remains partially implemented; W1–W7 are not SOURCE
COMPLETE or ACCEPTED. Snapcraft remains skipped.

## W6-M1 — complete schema-resource relocation

This bounded W6.01–W6.02 maintenance increment is **source-complete,
unverified**. It does not close all W6 or declare BusyAPI SOURCE COMPLETE or
ACCEPTED. The native authoring implementation, modern schema-reference sibling
eligibility and static `$dynamicRef` relocation corrections are retained.
No specification migration, B05 continuation or later execution work is included.

`refactoring_copy.ts` now preserves complete identified schema resources when
extracting an inline schema, moving a reusable definition or composing extraction
to a new source file. Canonical IDs are captured across configured roots and
checked outer first after the authored value has moved. A relative `$id` is
repaired only when its effective identity changes, including relocation out of
an enclosing identified resource within the same physical file. Unchanged
absolute and relative spellings, nested resource IDs, explicit dialects, named
anchors and static recursive references remain authored source. This also
retains an independently referenced schema in a copied payload when its literal
value and resource identity can both remain unchanged. Repairing a relative ID
that is also literal data remains an ownership refusal.
An empty resource pointer is checked against the graph's typed schema root:
independently interpreted schema files, including explicit dialect roots,
are not mistaken for anonymous native OpenAPI contexts when selecting a partial
subschema. Complete independently referenced roots with a distinct authored ID
retain that ID through extraction; partial file-root resources remain guarded.

Temporary proof graphs seed captured typed occurrences at their mapped
locations while stale reference addresses are repaired. Final graphs and cold
closure must rediscover those occurrences without those seeds. Consumers in
other files and configured entries use the existing canonical reference address
owner and original-coordinate CST edits. Retained public component bindings
remain distinct from extracted inline occurrences and physical file moves.
No new resolver, retrieval mechanism or transaction owner was added.

`schema_relocation.ts` supplies a bounded sufficient proof for genuine dynamic
references. Every captured schema keeps its effective dialect and applicable
dynamic-anchor binding frames; intrinsic applicator edges and schema
reference edges must match under relocation. Generated reference-only forwarding
nodes may be contracted only when any added resource frame has no binding for
the dynamically used names. Anonymous frames with no relevant bindings may
change retrieval base after ordinary reference repair; an unrelated identified
dynamic schema no longer blocks a proved static extraction. These conditions
preserve binding order for all
captured evaluation walks, including recursion. Comparing navigation candidates
remains an additional identity check, not the dynamic-scope proof. Complete
resources with multiple nested dynamic bindings use this proof through existing
copy and whole-file plans. A static `$dynamicRef` continues to use static address
construction while retaining its keyword, including in whole-file moves.

Actual semantic restrictions remain explicit: partial inherited resources may
not silently acquire new identities; anchors may not change owner or conflict;
an inline operation may not duplicate an identified resource retained in its
shared definition; dialect declarations and recursion are not stripped or
flattened. Unavailable proofs remain separate: `refactor.schema.dynamic-scope`
reports that evaluation-scope equivalence is not established, including a new
forwarding frame with a potentially relevant binding. Anonymous cross-resource
dynamic extraction without a scope proof, ambiguous overlapping interpretations,
incompatible
rendering contexts, unavailable cold retrieval mappings and proof-budget
exhaustion also retain explicit refusals. A refusal for unavailable proof is not
a claim that no equivalent transformation could exist.

The existing Core semantic/file plans, Store history, native Design/Source/
Reference transitions, review/cancellation checks and CLI review/apply/publication
remain the integration owners. Native copy and review failure mapping recognizes
the new dynamic-scope refusal. Typed Markdown and passive URI relocation now
also run for same-file copies when the containing schema base changes; general
shared Markdown and overlapping semantic-ownership maintenance remain next.

Prepared regressions extend the already registered engine copy, file, graph and
schema-resource-view suites, Core `refactoring_copy_test.dart`, native
`test/refactoring_copy_test.dart` and the applicable independent CLI suite.
Engine cases cover 3.1.0/3.1.1/3.1.2/3.2.0/3.2.1 in YAML/JSON, relative/absolute
IDs, same-file/cross-file moves, nested resources, plain and dynamic anchors,
independent and cross-entry consumers, explicit dialects, exact numbers and
positive/negative recursive-instance outcomes. Official vendored dynamicRef
cases compare actual binding outcomes before/after extraction to a file. A
negative control retains identical candidate declarations but refuses a newly
introduced binding frame. Older-family literal controls and existing partial
resource, recursion, identified-inline, ignored-sibling and URI-mapping negatives
remain. Core/native identified-schema cases extend existing alias/comment/BOM,
review/cancel, retired action, Undo/Redo, stale plan, failed publication and cold
reopen fixtures; CLI covers identified extraction, relocation, static dynamicRef
targets and identified-inline refusal through its production commands.

Actual verification is source inspection and `git diff --check` only. No tests,
compilers, analyzers, builds, generation, CI, graphical workloads, native
acceptance or packaging ran. Prepared regressions are **not passed evidence**;
runtime equivalence, publication recovery and cold reopening remain unverified.
The execution hold remains active, installed SDK/dependencies are unchanged,
Snapcraft remains skipped, and no push is authorized. After this increment,
continue the remaining W6 shared Markdown/overlapping ownership maintenance.
Typed multipart, XML/Linkset, streaming and mocks remain later assignments and
were not begun here.

## W6-M2 — shared Markdown and compatible semantic ownership

This bounded W6.03 increment is **source-complete, unverified**, starting from
`3ae955ceb1f652df577e642ca6745b2cb80154df` on `release/v0.1.0`. This is a source
implementation and prepared-regression status. It does not establish complete
W6, Phase 1, BusyAPI SOURCE COMPLETE or ACCEPTED. W6-M1, completed native
authoring, existing reviewed transactions and migration implementations remain
in place. B05 migration development was not resumed.

`markdown_relocation.ts` still edits only CommonMark destination token spans.
The pinned parser proves the complete non-URI tree and all effective link/image
destinations, including reference definitions, titles, code, HTML, literal text
and fragment navigation. A bounded joint mapping now considers every captured
rendering base. Absolute, relative, root-relative and network-path candidates
use the canonical URI owner for their proofs. Different per-context absolute
repairs do not imply incompatibility when one relative spelling preserves all
contexts. Progressive token admission retains the full tree and each repaired
destination's meanings before the final complete-tree proof.

`refactoring_markdown.ts` accumulates original contexts for each destination
occurrence; later roots re-prove earlier roots instead of repairing previously
repaired text. Copy and file maintenance inspect every canonical interpreted
role. Independently referenced schemas inside moved literal values also receive
the Markdown proof: an unchanged payload alone cannot justify changed rendered
destinations. URI fields use their corresponding typed roles and actual nested
resource contexts. An inline copy selects only the selected contract role's
canonical structural descendants through `ReferenceGraph.containedScopes`.
It does not adopt another schema/native interpretation merely because that
interpretation shares the definition's physical bytes. The graph's existing
children and Reference Object policies remain the semantic authority.

File repairs now give affected YAML fields independent source through
`MigrationSource`, including descriptions reached through object aliases and
reused scalar anchors. Other aliases retain their exact logical values; unused
anchor definitions and unrelated bindings stay authored when no edit requires
their separation. Compatible shared physical descriptions use one jointly
proved spelling. When conflicting roles or a literal description require
different text, the file planner can compose the existing `planInline` proof at
editable incoming contract occurrences, then run the ordinary complete file
move proof. It publishes one original-coordinate proposal containing the
specialization and move. The original structural/schema/literal owner retains
its meaning; the copied native occurrences get their own destination repairs.
Configured roots, captured unsaved consumers and separately located consumers
participate together. Attempts, CST edits and parsing remain bounded.

Extraction can separate an independently referenced contract occurrence from
literal data: copy the contract to the requested component or source fragment,
redirect established contract edges, and retain the original exact literal.
The retained literal's anchors and aliases are read through a private owned
copy; they do not need publication edits just to supply copied bytes. No payload
string scan discovers references. Complete identified schema interpretations
may transfer their active identity while the same identifier text remains
literal data at its original location. The existing address owner can prove a
same-file physical retrieval pointer during that private separation; it cannot
bypass a declared OpenAPI `$self`. Final graphs must rediscover the transferred
identity without temporary seeds. Static, recursive, anchor, dialect and dynamic
evaluation-scope checks remain separate and mandatory. Identified-resource
inlining restrictions remain unchanged. Inlining the final ordinary contract
use may retire that interpretation while the original literal stays exact;
copied consumers and every remaining consumer must still pass their proofs.

`refactoring_graph.ts` adds exact literal and independent byte-consumer checks.
They retain numeric tokens, binary payload strings, assertions and annotations,
and refuse changes to resources independently consumed as serialized examples
or saved upload bytes. Opaque moved files remain opaque; the final byte check
does not parse them as contracts. These checks also cover composed planning
steps and configuration repairs against the original capture, so intermediate
YAML ownership or inlining cannot hide a byte change. Core passes its already
captured manifest to semantic plans for saved-file ownership; its existing
configuration freshness checks still own external modification detection.
Located copy refusals map back to original source coordinates after private
alias expansion.

Engine, Core, native review and CLI use the existing entry points and transaction
owners. No second resolver, acquisition mechanism, semantic model or publication
system was added. Native review explains retained literal extraction and any
contract-use inlining included in a file move. Source changes, checked roots,
working-buffer history and file intents remain one reviewed unit. Existing
cancellation, stale-action checks, collisions, external modifications, grouped
recoverable publication and cold reopening remain authoritative.

The following refusals are deliberate and distinguish unavailable proof from
a demonstrated change to an independent consumer:

| Condition | Result and meaning |
| --- | --- |
| No common Markdown spelling and no editable incoming owner, or existing inline proof refuses the candidate | `refactor.markdown.context` retains the original source location and names the missing incoming ownership or the underlying inline refusal code. This is unavailable proof, not a claim that no equivalent transformation can exist. |
| Destination token/complete CommonMark mapping cannot be proved, or bounded work is exhausted | `refactor.markdown.mapping` / `limit.refactor.markdown` / `limit.refactor.ownership`; no partial plan publishes. |
| A selected structural/reference repair still changes independent literal data | `refactor.literal.ownership` / `file.move.literal.ownership`; ordinary data edits do not receive contract-edit permission. Explicit reviewed contract extraction or ordinary-use inlining can establish ownership where those proofs apply. |
| Logical values are equal but a captured serialized-example or saved-upload resource's bytes change | `refactor.literal.bytes` or the existing file example/upload content refusal. This is an actual independent-byte conflict for the proposed edits. |
| External example byte ownership cannot be established from its locator | `refactor.byte-context`; unavailable ownership proof, distinct from demonstrated changed bytes. |
| One authored reference has multiple object meanings; a container/member also owns an independent schema interpretation | Existing `reference.edit.context`, `refactor.shared-role` or contextual source refusal. General role splitting beyond captured structural/ordinary-reference ownership is not inferred. |
| Partial schema resource, duplicate identity/anchor, identified inline, recursive/ignored-sibling/Path Item ambiguity, or unproved dynamic scope | Existing W6-M1/inline/role-annotation guards. A successful Markdown proof never overrides these guards. |

Prepared production-path coverage extends the already registered engine
`test_refactoring_markdown.cjs`, `test_refactoring_copy.cjs`,
`test_refactoring_file.cjs`, `test_refactoring_ownership.cjs`,
`test_yaml_source_ownership.cjs`, literal maintenance `test_refactoring.cjs` and
`test_reference_markdown_context.cjs`. Existing `tools/build_engine.sh`
registration is retained. Cases include all native families and applicable
published patch declarations, YAML/JSON, independent/shared scalar and object
aliases, reused anchor names, literal/code/comment controls, relative links,
images/reference definitions, nested resource bases, compatible shared text and
conflicting role specialization, exact numeric/binary values, retained literal
extraction to components/new files, identified/recursive/dynamic schema outcomes,
and absent editable owners/independent byte-consumer refusals. Existing resource,
dynamic-scope, recursion, ignored-sibling and direct literal-edit negatives stay
registered. The previous blanket anchored-description refusal is now a positive
ownership case; incompatible/unavailable owners still have negative controls.

Core extends `markdown_refactoring_test.dart`, `refactoring_copy_test.dart`,
`literal_refactoring_test.dart`, `refactoring_cli_test.dart` and
`yaml_ownership_test.dart`. Native `test/refactoring_copy_test.dart` extends
review explanation, cancellation, application and history for literal extraction
and automatic shared-role file specialization. Existing Core/native directory
gates register these sources. Prepared cases cover captured unsaved changes,
multi-root specialization, stale plans/reviews and external configuration,
Undo/Redo, injected publication failures/retry and cold reopen. CLI review/apply
remains independent-process, stable-identity and source-preserving; reported
contract validation stays `not-run`. These are regression sources, not passing
evidence.

Producer declarations remain Engine `0.1.0`, protocol `1`, CommonMark `0.31.2`
and YAML `2.9.0`; the engine records `refactoringOwnershipRules: '1'`.
Schema evaluator, migration and mock producer revisions are unchanged. The
implementation producer is the local commit introducing this W6-M2 section;
generated engine assets and localization outputs have not been regenerated.
Actual checks were source inspection and `git diff --check`. No tests,
compilers, analyzers, generation, builds, CI, graphical/native workloads,
performance checks or packaging ran. The execution hold remains active,
dependencies/SDK sources are unchanged, Snapcraft remains skipped, and nothing
was pushed.

### Phase 1 reconciliation after W6-M2

The application matrix at the top remains the priority authority. Neither
unexecuted coverage nor an explicit unavailable proof is relabeled as missing
native controls. No additional refactoring ticket sequence is created.

| Remaining area | Reconciled status and next boundary |
| --- | --- |
| Native authoring W1.08–W1.10 | Preserve the completed bounded schema/reference authoring implementation. Full native clause/field/position qualification across Design, Source and Reference remains U; the held execution gates establish no acceptance. |
| Other W1 native surfaces | Existing family-specific metadata, controls and projections remain U where complete clause/surface closure has not been established. This increment supplies no evidence that those controls are absent. |
| W6.01–W6.03 maintenance | W6-M1/M2 close their bounded resource/Markdown/compatible ownership cases. General schema-bearing-position closure, virtual occurrences needing explicit physical YAML ownership, independent container/member schema roles and shared-reference-role splitting retain their concrete eligibility/proof boundaries above. Do not automatically expand each boundary into a speculative conversion assignment. |
| W6.04 Reference/export/adapters | Existing native/offline implementation remains U for complete rendered-field/relocation and pinned-adapter qualification. Maintenance Markdown equivalence alone does not establish complete export/native Reference acceptance. |
| W7 native professional journeys | Existing capture/review/history/publication owners and new regressions are prepared; full authenticated native-family journeys and packaged acceptance remain held. |
| Next concrete implementation priority | **Transport-integrated incremental streaming** was the priority after W4; its source-complete, unverified W5.01/W5.02 handoff is now recorded below. Do not automatically resume B05 migration or W6 refactoring microtasks. The execution hold remains active. |
| Other application gaps | XML/Linkset wire mapping, transport-integrated streaming, CONNECT mocks, remaining mock witnesses and example/part selection remain P/M as recorded in the application matrix. They were not implemented or declared complete here. |
| Migration and acceptance | Existing migration work remains intact and separately reconciled in Phase 3; B05 is not resumed. Phase 4 still requires explicit authorization lifting the execution hold and complete current-revision verification. |


## W4.01 — Native typed multipart generation handoff (2026-11-09)

**SOURCE COMPLETE, unverified.** This increment starts at
`28c65c5f6c66c1bd35d44f40f2055c533813f05e` in the primary
`release/v0.1.0` checkout. No compilation, analysis, tests, builds, generation,
CI, graphical workloads or performance checks were executed. Snapcraft remains
skipped. Overall BusyAPI SOURCE COMPLETE and ACCEPTED remain unmet.

### Captured interpretation and production preparation

`form_semantics.ts` is the version-aware authority for named versus ordered
multipart, located schema alternatives, tuple/item paths and transport hints.
`execution.ts` captures that policy with each request-media declaration;
`multipart_generation.ts` projects the actual selected instance into directives
for the existing Core serializer. It performs no file acquisition and introduces
no alternate MIME parser. Swagger retains flat formData/file/required/repeated
parameter interpretation and constraints. OpenAPI 3.0.0–3.0.4 and 3.1.0–3.1.2
retain their named property/array and per-property Encoding semantics. OpenAPI
3.2.0–3.2.1 additionally captures ordered form-data, unnamed generic multipart,
prefixEncoding, itemEncoding, itemSchema and nested Encoding. Ignored or absent
positions do not activate an Encoding codec. Named Encoding keys absent from
captured schema properties and older-family newer keywords remain inactive.

The former Core implementation-wide named-only and positional-Encoding refusal
conditions have been replaced by actual structured generation. Ordered
form-data uses an array of singleton name/value objects; generic multipart uses
ordered array values. Named arrays emit repeated fields, including single-item
arrays and index-specific tuple schemas. Optional tails are omitted by shortening
the array. Null is an actual typed value; a file uses an explicit null placeholder
and an instance JSON pointer. Legacy named file groups remain supported, with
captured single/array choices. Empty optional collections omit fields; required
collections that become absent on this wire must still satisfy the original
schema. A zero-part entity is refused under RFC 2046.

Each selected part retains original schema targets, its applicable Encoding and
Header owners, name/position, media options and source location. Disjoint JSON
kinds may select a unique captured representation; same-kind alternative codecs
require an explicit captured choice. Logical choice routes survive ordinary
resource relocation. Selected alternatives and their containing conditional or
composition branches are evaluated against the original captured schemas;
transport hints never replace those schemas.

Core retains approved file access, freshness/ownership checks and immutable
captures. The shared boundary/disposition framing helper and existing transfer,
text and form codecs produce named, ordered and nested entities. File bytes
remain binary; generic filenames use the existing MIME parameter rules,
including an explicit UTF-8 extended filename when needed. Root charset
parameters do not recode individual parts. Nested URL-encoded media alone use
the existing form percent-encoding codec; multipart leaves remain unescaped.
Explicit generic Header lines, media parameters, text charsets, transfer tokens,
empty values and duplicate field multiplicity are preserved.

Both legacy named generation and the typed tree path now submit actual emitted
bytes to the existing MIME/runtime form decoder before dispatch. Leaf payloads,
file hashes, filenames, ordering, transfer tokens, explicit tree Header values
and exact typed values have identity checks. Original whole-content, item and
selected-branch schemas plus applicable Headers are checked by the existing
schema evaluator. Generated schema-invalid or incompletely proved bodies fail
preparation. Raw serialized entities retain the existing outgoing validation
report behavior, including deliberately invalid request/response controls.

### Native, saved cases, CLI and existing consumers

Native Request uses existing BusyAPI components for media selection, exact JSON
entry, ordered-item append, captured representation/media choices, file picking,
per-part Headers and prepared-byte inspection. Header declarations and reasons
for controlled/ignored fields are visible. Append edits preserve exact numeric
source through Engine CST editing. Draft snapshots retain choices, files, array
edit state and operation/environment identity. A failed preparation leaves
unrelated input available for correction; stale choices remain removable.
Prepared inspection is cancelled and invalidated through the existing controller
owners and closes its held captures.

Saved cases accept named objects or ordered arrays, relative approved files,
partMediaTypes, partSchemas, partHeaders and existing fileShapes. Core's existing
contract-test runner and independent CLI use the same captured plan and builder.
No CLI-only serializer or mock engine was added. Actual generated multipart bytes
flow into existing outgoing and mock request validation; response validation
continues to evaluate the actual response independently.

Production owners changed:

- Engine: `execution.ts`, `form_semantics.ts`, new
  `multipart_generation.ts`, `runtime_form.ts`, `runtime_multipart.ts`,
  `multipart_encoding.ts`, `multipart_header_values.ts`,
  `runtime_evaluation.ts`, `server.ts`, `schema_reference_projection.ts` and
  `schema_evaluation.ts`.
- Core: `request.dart`, `execution.dart`, `form_media_types.dart`,
  `multipart_encoding.dart`, `contract_test.dart` and `project.dart`.
  Existing `form_serialization.dart`, transfer codecs and approved capture
  owners are reused without another serializer or acquisition layer.
- Native: `request_run.dart`, `request_part_media.dart` and
  `request_part_headers.dart`.

### Prepared regression evidence (all unexecuted)

The required Engine suites remain registered in `tools/build_engine.sh`:
`test_generic_multipart.cjs`, `test_multipart_encoding.cjs`,
`test_runtime_multipart.cjs`, `test_form_semantics.cjs`,
`test_multipart_file_shapes.cjs`, `test_multipart_header_generation.cjs` and
`test_mock_positional_multipart.cjs`. Their extensions cover prefix/tail/nested
planning and emitted-byte proof, ordered form-data duplicate names, ignored
missing positions and older-family metadata, independent itemSchema, named
unions and tuples, nullable/encoded values, selected file hashes, explicit
Header content and dispositions, media alternatives, nested form content/styles
and item kinds, exact numbers, relocation-stable choices and malformed/stale
inputs. Existing exact-byte and original-schema negative controls remain.

Core coverage extends `generic_multipart_execution_test.dart`,
`positional_multipart_execution_test.dart`, `structured_form_execution_test.dart`,
`multipart_file_shapes_test.dart`,
`multipart_header_generation_execution_test.dart` and
`multipart_framing_execution_test.dart`, `binary_multipart_execution_test.dart`
and the existing transport/ownership suite. New typed production journeys include
actual HTTP bytes, Swagger flat constraints/repeated fields/files, nested files,
media choices, unsaved capture, original-schema
predispatch failures, fixed-boundary collisions, cancellation/retry, capture
retention when the original upload changes during proof, saved-case reopen,
relocated independent CLI execution and generated bytes sent to the existing
mock consumer. Existing approved upload regressions retain changes during
acquisition and capture-cancellation controls. Core suites remain included by
`tools/build_linux.sh`'s existing Core test-directory invocation.

Native extensions to `multipart_file_shapes_test.dart`,
`request_part_headers_test.dart` and `request_review_regressions_test.dart`
cover both 3.2 patches and applicable older patches, required controls, exact
entry/append, files/Headers/prepared inspection, invalid-input repair, retained
operation/environment drafts and schema-invalid generated input with no second
dispatch. Existing raw invalid-response/request controls remain separate.
Producer expectation updates in other existing suites only admit this revision;
they do not resume migration or refactoring implementation.

### Specific remaining boundaries and verification

There is no retained implementation-wide refusal of typed positional or required
first-level nested multipart. Remaining failures identify the actual unavailable
representation or proof: XML/Linkset and other media without a native modeled
codec; an unsupported transfer/charset token; missing concrete media or schema
choice; unresolved or genuinely dynamic annotation bindings; shared alternative
leaves whose branch identity cannot be proved; schema-invalid selected values;
undefined RFC6570 nested values or a multi-field exploded composite with no
single ordered-position inverse; or a stale/ambiguous field ownership choice.
A file supplies approved raw media bytes; it does not grant a missing modeled
codec or schema proof. Nested multipart remains bounded to eight levels, 2048
MIME parts and 2048 captured controls, together with existing schema-work,
16 MiB typed-JSON, 64 MiB Engine frame and Core upload-size limits. No deeper or
larger workflow is claimed beyond those bounds.

Schema producer is `hyperjump+busyapi-exact` **1.18.0+63**, including
`typed-multipart-generation-v1` and `nested-form-model-v1`. Multipart projection
revision is **2**; schema-example projection stays **3**, protocol stays **1**
and Engine package version stays **0.1.0**. Core admission and current regression
pins agree. Mock/migration producer versions and third-party software, Flutter,
Dart, dependencies, engines and SDKs were not changed. Packaged/generated assets
were not rebuilt under the hold.

Verification actually performed: production and regression-source inspection,
consumer/registration searches, revision-pin inspection and `git diff --check`.
These checks establish no test pass, compiler success, native journey or installed
CLI success. All described runtime outcomes are prepared assertions awaiting
execution authorization. The changes are to be committed locally without a push.

**Next application capability: XML/Linkset wire mapping (W4.04/W4.05).** Do not
automatically resume B05 migration, W6 refactoring, streaming or CONNECT work.

## W4.04/W4.05 XML and Linkset wire support — 2026-11-09

**W4.04 XML: SOURCE COMPLETE, unverified.**
**W4.05 Linkset: SOURCE COMPLETE, unverified.**
These statuses describe the production source and prepared regression coverage,
not compilation, runtime acceptance, or overall BusyAPI completion. The execution
hold remains active. No tests, compilers, analyzers, builds, generation, CI,
graphical workloads or performance checks were run. Snapcraft remains skipped.
Verification consists of source review, normative-source consultation and
`git diff --check` only.

The original starting revision was
`4386f5bcf60336c37e09e4e94a066ec33eacad6c`; the incomplete codec foundation was
`a940fcbe8ab9a3efb5442c3b7a843cc55e249519`. This completes that same assignment
in the primary `release/v0.1.0` checkout. No B05/W6, streaming or CONNECT work
was started, and no publication or push was performed.

### Producer admission and representation ownership

Core's admission mismatch was corrected to the then-current `1.18.0+64` before
extending the codecs. The completed semantic increment now advances both the
production Engine and Core to `hyperjump+busyapi-exact` **`1.18.0+65`**.
Admission remains strict in
`project.dart`, `execution.dart` and `mock.dart`; the partial `+64`, obsolete
`+63` and malformed
results are rejected. Positive fixtures were updated. The permanent regression
in `test_mock_validation_revision.cjs` reads the actual Engine and Core source
declarations and checks the admission owners, rather than comparing two test
fixtures or trusting an old bundle.

XML configuration identities are `xml-wire-v2` and `xml-model-v2`; Linkset is
`linkset-codec-v2`. Request representation capture is `xml: 2`, `linkset: 2`,
with existing multipart projection **2** and schema-example selection **3**
unchanged. External-example bytes **2**, embedded MIME text **1**, native mock
response **5**, parameter **6**, schema samples **4**, security **1** and methods
**1** keep their existing identities. Their configuration still incorporates the
strict captured schema producer/configuration. Contract-test report producer is
**3**, reflecting explicit saved data/serialized representation modes.

The existing exact-number canonical schema evaluator is the only assertion
owner. XML branch selection calls its compiled original schema resources,
including captured dialects and dynamic scope. It does not generate replacement
schemas, choose the first successful branch as an interpretation, or use a
second schema evaluator. Generation validates original typed data, emitted
representation and modeled correspondence. Actual received bytes have a
separate structural check before schema conformance. No failed modeled check
falls back to a successful opaque check.

### Completed production paths

| Path | Source behavior and owners |
| --- | --- |
| XML interpretation | `xml_model.ts`, canonical graph/reference projections and `xml_semantics.ts`: allOf assertions, applicable alternatives/conditionals/dependent schemas, reference siblings, dynamic references, node-producing wrappers and lazy finite recursive instances. Names, namespace inheritance/prefixes, attributes, wrapped/unwrapped/repeated and positional arrays, primitive text, explicit text/CDATA and mixed ordered content retain captured ownership. Older families do not activate 3.2-only node types. |
| XML wire | `xml_wire.ts`: XML 1.0 parsing/escaping and exact numeric lexemes; fatal UTF-8, UTF-16LE/BE, ASCII and ISO-8859-1 codecs in both directions. BOM, MIME charset, declaration and autodetection precedence are explicit. Raw Unicode XML is transcoded without repairing its markup; approved external bytes bypass transcoding. |
| Linkset wire | `linkset.ts`: RFC 9264 JSON model and ASCII HTTP-Link-compatible text share contexts, relation types, targets and attributes. Quoted commas/semicolons, escapes, repeats, relative references and RFC 8187 UTF-8 attributes retain meaning. JSON Unicode/extension metadata stays intact; no JSON-LD context or profile URL is fetched. Registered relation structure is pinned to the IANA 2026-06-12 snapshot. |
| Actual Header production | Engine `requestContentParameters`, Core `_serializeParameter`, native mock Header generation, and MIME Header generation consume shared codecs. Structured JSON model input produces textual `application/linkset` fields. Existing HTTP field-line combination handles repeated Link lines without splitting quoted commas; controls are rejected. Actual named Link fields cannot declare the JSON wire representation. |
| Requests and responses | `runtime_media.ts`, `runtime_evaluation.ts`, `runtime_headers.ts`, Core `execution.dart`/`request.dart`: captured preparation bytes, original-schema predispatch proof, actual HTTP bytes, media selection, decoding, conformance and located diagnostics. Core delegates XML charset/BOM decisions to Engine rather than pre-rejecting or UTF-8-decoding those bytes. Malformed, invalid representation, schema-invalid, unavailable and bounded-limit results remain distinct. |
| Forms and multipart | `form_serialization.dart` uses an Engine callback for XML/Linkset media fields, including nested URL forms. `multipart_generation.ts`, `runtime_form.ts`, `runtime_multipart.ts`, `mime_header_content.ts` and `embedded_mime_text.ts` keep each field/part's original schema and media. XML/Linkset named parts enter the existing typed tree; no unrelated parent schema is borrowed. Canonical multipart inversion runs inside evaluator lifetime, with original typed/root assertions, actual emitted bytes, binary identities and correspondence all retained. |
| Examples | Existing Example field interpretation and approved external-resource owners are preserved. Structured examples use modeled preparation; serialized examples keep wire semantics; approved external bytes retain exact content identities. Embedded XML MIME text uses the shared charset transcoder. Changed approved bytes fail freshness checks. |
| Mocks | Native body, parameter, response and Header validation use the same codecs and original schema resources. Authored and generated XML/Linkset bodies are proved before emission. `mock_multipart_generation.ts` consumes the existing captured part directives for bounded response framing, including XML charset bytes, Linkset parts/Headers and nested forms; standalone URL-form mock generation uses that form writer. Both typed data and actual generated response bytes are checked, including correspondence. Existing mock routing/security and approved external-byte boundaries remain in place. |
| Native Request and Inspector | Existing media/structured/raw controls, Header controls and prepared multipart inspection are retained. Serialized body and redacted Header previews are capture-bound and cancelled when stale. Raw/structured/media drafts are independently retained within the existing bounded draft lifetime. Inspector retains original response bytes/export and adds Engine-modeled XML/Linkset data; the outgoing view retains the actual enqueued byte prefix plus modeled data. No editing architecture was replaced. |
| Saved cases and CLI | Engine CST edits use existing configuration proposal/review/publication transactions. Cases preserve exact values, data/serialized/literal-row body and parameter modes, media, part/Header choices, standalone and multipart approved project-relative file references, environment/server/security selections, variables and timeouts. Native reopening and independent CLI use Core's same decoder/builder; no desktop state or duplicate Dart XML/Linkset codec is required. |

### Explicit inversion policies and refused classes

- Element null uses an empty `xsi:nil="true"` element. Nullable attributes are
  omitted on output. On input, optional absent nullable attributes normalize to
  omission; required or schema-necessary ones become null only through full
  original-schema proof. These are documented normalization equivalences, not
  invented distinct wire markers. Both original and normalized data must satisfy
  the original schema.
- Absent optional unwrapped arrays/groups and empty optional character nodes
  normalize to omission when permitted by the original schema; required or
  schema-necessary empty values remain present through whole-schema proof.
  Required empty unwrapped arrays become `[]`. Wrapped
  arrays retain their element. Positional schemas, inline group boundaries and modeled fixed character
  lengths disambiguate text where possible. Empty optional text array positions
  with distinct valid inversions are refused, rather than invented as a unique list. Bounded complete candidates are
  checked against the full original schema. Distinct schema-valid inversions
  beyond those normalization policies are unavailable proof.
- Primitive text uses exact JSON decimal spelling, `true`/`false`, literal
  `null`, or the string itself. CDATA preserves character data and splits `]]>`
  safely. XML 1.0 line-ending normalization applies to CDATA; input requiring an
  incompatible character/CDATA inverse is refused by correspondence/schema
  proof. Object/array-to-character-node conversion without a captured primitive
  interpretation, primitive `nodeType: none`, missing node names, conflicting
  applicable XML metadata and unmodeled free-form content have precise located
  unsupported results.
- Namespace prefixes may differ on received documents; expanded names govern
  interpretation. Names are taken from XML metadata and applicable schema
  positions, never operation names, filenames or examples. A root/array item
  with no applicable inferred or authored name is unavailable proof.
- XML 1.1, UTF-32 and other unsupported codecs are explicitly refused. UTF-16
  without an explicit endian MIME label requires its BOM. Authoritative BOMs
  take precedence over conflicting MIME/declaration labels. ASCII/Latin-1 text
  can use numeric references; unrepresentable names or explicit CDATA cannot be
  silently replaced. Raw mode does not repair malformed content.
- DTDs/general entities and all external XML acquisition are denied. Only
  predefined/numeric entities are expanded. Limits remain finite: 16 MiB XML,
  128 instance levels, 400000 total element/character nodes, 200000 model steps, 2048 branch proofs,
  2048 adjacent text positions,
  256 alternatives/inversions, and bounded canonical proof work (200000 steps
  per proof, 2000000 per media-evaluation job). Same-instance schema cycles
  cannot masquerade as finite recursive data. Multipart retains eight nesting
  levels, 2048 parts, framing/transfer controls and approved file identity checks.
- Linkset text is ASCII only. Ordinary non-ASCII quoted attributes are invalid;
  supported internationalized attributes use RFC 8187 UTF-8. JSON Unicode is
  separate and valid. Unknown JSON metadata is preserved and may be validated
  by the captured schema; defined internationalized members retain RFC 5646
  language-tag syntax (bounded to 1024 characters). Profile parameters require
  nonempty URI lists without acquiring those URIs. Metadata lacking a lossless textual equivalent is
  explicitly refused for text/Header output. Empty relation arrays, multiple
  `title*` values and unsupported extended charsets are refused where text
  cannot preserve their meaning. Relative references and absent/explicit
  anchors are retained rather than resolved against an invented context.
- Actual HTTP/MIME field controls and separate-field rules remain enforced.
  JSON Linkset is not emitted as an HTTP Link field. Original received field
  bytes are retained. Mock file acquisition is not invented: file-bearing mock
  bodies use approved serialized external examples. Unresolved/ambiguous
  representation choices and unsupported dialects remain unavailable proof.
- Inspection is bounded (modeled body data up to 1 MiB; outgoing byte preview up
  to 16384 bytes). Preview/export status does not imply full receipt or complete
  conformance. Literal rows authored outside the native line controls with
  embedded line breaks or `=` in a field name remain executable through Core/CLI,
  but native reopening
  refuses an unrepresentable line edit before replacing the current draft.
  Body interpretation is kept in memory for inspection and is not
  added to contract-test report JSON. No credentials are written by preview.

These are representation/inversion and resource boundaries. There is no known
required XML/Linkset workflow retaining an implementation-wide opaque-only
restriction. No further XML/Linkset production integration gap is recorded by
this source review. Compilation and actual behavior remain unverified, including
all newly prepared tests; execution authorization is still required for those
claims.

### Production files changed in this completion increment

- Engine (`tools/contract_engine/src/`): `xml_model.ts`, `xml_wire.ts`,
  `linkset.ts`, `modeled_media.ts` (new), `runtime_media.ts`,
  `runtime_evaluation.ts`, `schema_evaluation.ts`, `execution.ts`, `server.ts`,
  `runtime_form.ts`, `runtime_multipart.ts`, `multipart_generation.ts`,
  `embedded_mime_text.ts`, `serialized_parameter_examples.ts`,
  `mock_native_validation.ts`, `mock_multipart_generation.ts` (new),
  `mock_generation_adapter.ts`, `mock_projection.ts`, `mock_request_parameters.ts`,
  `mock_response_examples.ts`, `mock_schema_samples.ts`, `mock_server.ts`.
- Core (`packages/busyapi_core/lib/src/`): `project.dart`, `execution.dart`,
  `request.dart`, `contract_test.dart`, `form_serialization.dart`,
  `multipart_encoding.dart`.
- Native (`lib/src/workspace/`): `request_run.dart`,
  `request_part_headers.dart`. Existing Request/Inspector controls and lifecycle
  remain the workflow owners.
- Gate: `tools/build_engine.sh` registers the new dedicated Engine suite.
  Existing Core/widget discovery gates include the new journeys. The regression
  files and producer fixtures are part of this same local change.

### Prepared production regressions and established gates

- Engine `test_modeled_xml_linkset.cjs`, registered in `tools/build_engine.sh`:
  all four families/published patches in YAML/JSON; composed/referenced and
  dynamic/recursive XML; alternatives/conditionals/dependencies; wrappers,
  namespaces/attributes/groups; ordered arrays, text/CDATA, null/empty policies,
  exact numbers and inversion ambiguity; separate schema-valid but different
  values/bytes as correspondence negative controls; outbound/raw charset/BOM rules;
  invalid neighbors; JSON extensibility; ASCII/RFC8187 controls; actual Header
  preparation/combination; named/ordered multipart and URL-form wire proof.
- Existing Engine gates `test_runtime_media.cjs`, XML names/namespaces,
  `test_runtime_headers.cjs`, MIME Header content, literal/serialized examples,
  multipart encoding and `test_embedded_mime_text.cjs` retain their controls.
  The latter now covers XML MIME-leaf charset materialization.
- Existing `test_mock_native_validation.cjs` and
  `test_mock_mime_header_content.cjs` add actual HTTP modeled bodies, generated
  bodies, generated multipart/URL-form responses, Link Headers, XML/Linkset
  parts with their own schemas, internationalization, invalid values and entity
  denial. `test_mock_validation_revision.cjs` adds production-source producer
  consistency. All are already in the Engine gate.
- Core `native_media_execution_test.dart` prepares composed/referenced XML and
  both Linkset journeys through actual HTTP, byte inspection, strict original
  schema evaluation, cancellation, actual custom Header lines without a
  parameter draft, saved proposal/publication, cold reopening
  and independent CLI replay. Charset/raw-mode, standalone approved file/CLI, literal field-row reopening and URL-form journeys extend it.
  `multipart_header_generation_execution_test.dart` adds XML charset bytes,
  structured Link MIME Headers, original schema proof and saved-case reopening.
  `external_body_examples_test.dart` adds approved XML/Linkset byte fidelity,
  cancellation and freshness failures. Existing metadata/Header/example/case
  negative controls remain. Positive producer fixtures advance only to `+65`;
  obsolete/malformed rejection tests remain, including explicit `+63`/`+64` rejection.
- Native `test/xml_linkset_request_test.dart` prepares existing controls,
  preview, raw/structured draft retention, actual dispatch/inspection, saved
  reopening and stale unsaved-contract refusal. Existing Core/widget discovery
  gates include these tests; no separate execution path or placeholder test was
  added.

**Prepared only: no test has been executed or reported as passing.**

Normative basis: [OpenAPI 3.2.1 XML](https://spec.openapis.org/oas/v3.2.1.html#xml-object),
[Header Linkset modeling](https://spec.openapis.org/oas/v3.2.1.html#modeling-link-headers),
[RFC 9264](https://www.rfc-editor.org/rfc/rfc9264.html),
[RFC 7303](https://www.rfc-editor.org/rfc/rfc7303.html),
[RFC 8288](https://www.rfc-editor.org/rfc/rfc8288.html),
[RFC 8187](https://www.rfc-editor.org/rfc/rfc8187.html), and the
[IANA Link Relations registry](https://www.iana.org/assignments/link-relations/).

The W4 handoff prioritized transport-integrated incremental streaming; its
completion increment is recorded immediately below. This historical W4 entry
does not declare BusyAPI SOURCE COMPLETE or ACCEPTED.


## W5.01/W5.02 incremental streaming — source handoff, 2026-11-09

**W5.01: SOURCE COMPLETE, unverified. W5.02: SOURCE COMPLETE, unverified.**
This is the transport-integrated streaming capability, with the finite and
resource boundaries below. It does not complete W5.03/W5.04, overall BusyAPI or
runtime acceptance. Starting revision: `13d3855e0fdbcf7c539f34ac138a6e12283f00ee`,
branch `release/v0.1.0`, primary checkout. No B05/W6, CONNECT or SDK/dependency
work is part of this increment. No push or publication is authorized.

### Production behavior and ownership

- Engine `runtime_stream.ts` frames bounded continuations; `stream_execution.ts`
  recovers the actual captured response/status/media/schema on every chunk.
  Continuations are bound to snapshot, operation, run, media, status and producer.
  They require no worker affinity, global stream cache or resource acquisition.
  The existing runtime media parser and canonical schema evaluator remain the
  only data parser/evaluator. No schema is fabricated from a received value.
- JSONL/NDJSON handles split LF/CRLF, strict UTF-8, forbidden BOM/empty records
  and an allowed final unterminated line. JSON-seq and compatible `+json-seq`
  types handle split RS, pretty-printed JSON, resynchronization, consecutive RS
  and RFC 7464 scalar truncation protection. Lexical framing retains exact CST
  numeric values; transport chunks never stand for application records.
- Finite and incremental SSE share `runtime_sse.ts`: CR/LF/CRLF, exactly one
  initial BOM, UTF-8 replacement decoding, comments/ignored fields, multiline
  data, persistent ID/retry, null-ID denial and dispatch only at blank lines.
  EOF discards an undispatched event as required by the standard. Typed finite
  SSE generation refuses CR data/injection and any data model that cannot make
  the documented inverse correspond; it never silently changes authored data.
- MIME framing exports the existing `mime_parts.ts` boundary scanner. Completed
  fragments re-enter the original MIME/transfer/Header/schema decoder; the
  stream adapter does not implement a second MIME grammar. Ordered positions,
  binary leaves, per-part media, nested content and original schema identities
  are retained. Nested children become inspectable before their enclosing part
  ends; completed enclosing parts also produce records. Record paths identify
  actual MIME positions; aggregate record counts include these completed nodes.
- Applicable `itemSchema` is evaluated independently on each item only in OAS
  3.2. Older families retain their existing declaration/dialect rules. Multipart
  leaf alternatives are evaluated as original schemas rather than conjoining
  their branches. Whole-context alternatives/conditions remain provisionally
  unchecked until the original complete-content proof can resolve them.
- Known binary media retain original octets and exact cumulative decoded length.
  The canonical evaluator receives length provenance without allocating a dummy
  body. Whole binary schemas, including non-monotone `not`/alternatives, are
  checked at EOF; a short prefix never becomes a permanent false violation.
  A binary body has no invented item boundaries for `itemSchema`.
- Core `request_stream.dart` runs inside `request.dart`'s existing paused receive
  subscription, awaited storage slot and SDK content decoding. Each storage,
  evaluation and observer step completes before receipt resumes. Original wire
  bytes retain the existing owned response file/hash/export lifecycle. Gzip
  decoder output and each coding layer are bounded; final decoding independently
  proves the complete received representation, including gzip framing/checksums.
- Status and proof are separate: active evidence is provisional; complete means
  EOF plus framing/decoding/Header/whole-content proof; Stop deliberately retains
  checked items; interruption remains incomplete; observed violations remain
  invalid. Machine-readable `valid` requires complete proof. Counts survive
  evidence eviction. Whole-schema failure does not invent invalid item counts.
  Limits/unavailable evaluation are warnings, never opaque-validation success.
- Cancellation, Stop, inactivity/overall deadlines, peer disconnects and failures
  retire the existing subscription/evaluation/file owners. Removable cancellation
  listeners prevent completed chunk RPCs from accumulating on a long-lived run.
  Late worker results cannot publish after capture replacement or cancellation.
- Native `request_run.dart` uses the existing Request/Inspector disclosures and
  source views for live record data/findings, status, byte/record counts and Stop.
  Final inspection retains original bytes/export and a stream view. Capture,
  operation, project and epoch guards protect unsaved edits/replaced operations.
  Existing draft/media/environment/authentication and approved-file ownership
  remain shared; no separate editor or transport was introduced.
- Saved cases preserve the optional bounded `stream.stopAfterRecords` policy
  with the existing request configuration. Core contract-test reports and the
  independent CLI consume the same executor, exact counts, terminal status and
  item findings. Reports omit record payloads, secrets and private response-file
  paths. Cold reopening requires no desktop state; stopped cases cannot pass.
- Finite generated sequence bodies and authored/approved serialized examples use
  the shared typed/wire codecs and final original-schema/correspondence checks.
  Existing mocks generate finite responses; an unbounded synthetic producer is
  not introduced. Exact upstream proxying uses its existing Node transport with
  awaited downstream writes/drain and decoded validation. It forwards original
  bytes while upstream remains open, never waits for a whole body to discover
  records, and buffers bounded whole-content data only when that proof requires
  it. Original received Header lines are validated before forwarding removes
  hop-by-hop fields. The validation-complete Header stays false; terminal
  trailers and bounded `stream-result` reports carry actual counts/status.
  Interrupted peers are destroyed without a fabricated successful EOF.

### Explicit representation and resource boundaries

- Engine input chunks: 64 KiB; at most 128 records per evaluation batch;
  unfinished record/enclosing MIME item: 16 MiB; nested MIME depth: eight;
  JSON-seq lexical depth: 128. Existing MIME Header/part/transfer limits remain.
  A large enclosing MIME part can exhaust its item budget after earlier child
  results were checked; these results survive with incomplete full proof.
- Core retains at most 128 record evidence entries within 1 MiB and at most 200
  diagnostics within 1 MiB, with aggregate counts/observed-invalid state retained
  independently. Each Engine preview is at most 16 KiB. SDK decoder bursts are
  bounded to 2 MiB; original response/decoded storage defaults remain 256 MiB.
  Existing configurable timeouts (including the ten-minute upper bound) remain.
- Whole-content proof retains the canonical source/CST/evaluation work limits,
  including finite sequence item/check bounds. Large streams with independent
  items and no whole assertions continue beyond the finite decoder's 2048-item
  bound; a nontrivial whole schema exceeding that budget stays unavailable.
  Complete receipt alone never overrides that result.
- Core preserves its supported gzip/identity coding policy (eight layers); exact
  proxying preserves its gzip/deflate/Brotli policy (four layers and 64 MiB wire,
  per-decoder and whole-proof budgets). Unsupported codings are explicit failures,
  not replacement-decoded text. Wire bytes and decoded counts stay separate.
- Generic ordered/nested OAS positional Encoding rules apply in 3.2. Earlier
  families retain named mappings and their existing explicit unavailable result
  for an undeclared/ambiguous property correlation. Newer keywords are not
  activated in older documents. Unknown schema dialects, unresolved references,
  unsupported leaf codecs and context-dependent inversions remain located
  unavailable proofs, never a replacement schema or guessed successful binding.
- These are finite resource/representation boundaries. No additional required
  streaming production surface is known missing in this source review; compilation
  and actual runtime behavior remain unverified under the execution hold.

### Changed production owners and producer identities

- New Engine owners: `runtime_stream.ts`, `stream_execution.ts`, `runtime_sse.ts`,
  `mock_stream_response.ts`. Changed Engine owners: `runtime_media.ts`,
  `runtime_binary.ts`, `runtime_evaluation.ts`, `runtime_form.ts`,
  `runtime_multipart.ts`, `form_semantics.ts`, `mime_parts.ts`, `exact_numbers.ts`,
  `execution.ts`, `schema_evaluation.ts`, `server.ts`, `mock_exact_proxy.ts`,
  `mock_native_validation.ts`, `mock_response_validation.ts`, `mock_server.ts`,
  `mock_generation_adapter.ts`, `mock_response_examples.ts`, `mock_schema_samples.ts`.
- New Core owner: `packages/busyapi_core/lib/src/request_stream.dart`. Changed
  Core owners: `request.dart`, `execution.dart`, `project.dart`, `contract_test.dart`.
  Native owner: `lib/src/workspace/request_run.dart`. CLI uses the existing Core
  runner, with no parallel transport or evaluator.
- Canonical schema producer: `hyperjump+busyapi-exact` **`1.18.0+66`**, with
  `incremental-stream-v1` added to its configuration. Core admits exactly `+66`;
  obsolete/malformed identities remain rejected. XML/model v2 and Linkset v2
  configuration identities are preserved. Request representation revisions:
  multipart **2**, schema examples **3**, XML **2**, Linkset **2**, stream **1**.
- Streaming result producer: `busyapi-incremental-stream` **1**, with canonical
  schema name/version/configuration and captured ownership. Contract-test report
  producer advances from **3 to 4** for stream evidence/terminal semantics.
  Mock response-wire **5**, parameter-wire **6**, sample candidates **4**,
  security **1** and method **1** remain unchanged; their canonical schema
  configuration includes the new producer identity. No older identity is admitted
  as a compatibility shortcut.

### Prepared regressions and gate registration — not executed

- New Engine `test_incremental_streaming.cjs`: actual captured response RPC;
  all eleven recognized declarations in YAML/JSON; JSONL/NDJSON/JSON-seq/suffix
  and SSE; every significant byte split, UTF-8/exact values, finite comparison,
  independent failures/recovery, scalar truncation controls, SSE dispatch/EOF,
  family boundaries, named/ordered/nested MIME, transfers/binary positions,
  leaf alternatives, byte-length EOF semantics, capture/run rejection and bounds.
- New Engine `test_streaming_mock_proxy.cjs`: actual native mock subprocess and
  HTTP peers; plain/gzip delivery before EOF, JSON-seq/SSE/MIME forwarding,
  original wire bytes, trailers, invalid items, disconnect cleanup, unavailable
  binary items, and shared finite generated sequence/SSE witnesses.
- `test_mock_validation_revision.cjs` compares actual Engine and Core schema
  declarations and actual stream revision/admission code. Current positive
  producer expectations are `+66`; explicit `+65`, `+64`, `+63` and malformed
  rejection controls remain. Existing finite/media/multipart/XML/Linkset gates
  are retained. `tools/build_engine.sh` registers both new Engine suites and
  the stream execution bundle entry.
- New Core `incremental_stream_execution_test.dart`: actual HTTP across four
  families/formats, live-before-EOF results, exact/Unicode one-byte writes,
  whole-schema deferral, independent invalid items/scalars, gzip members,
  separate awaited storage/evaluation gates, 3000-record bounded retention,
  nested MIME/binary delivery, Stop/cancel/timeouts/disconnect, byte limits,
  non-monotone binary schemas, saved publication/cold reopen and independent
  successful/stopped CLI reports with exact counts/byte identities.
- New native `test/incremental_stream_request_test.dart`: existing workspace,
  Engine, actual HTTP, live controls, original bytes, Stop, saved reopening and
  stale unsaved-capture refusal. Existing Core directory and widget discovery
  gates include the new files; no placeholder or isolated-parser success gate
  replaces a production path. Producer fixture updates retain negative controls.

**Verification performed:** source/diff review, production declaration/gate
inspection and `git diff --check` only. No tests, compiler, analyzer, build,
generation, CI, graphical/performance workload or Snapcraft execution occurred.
No test is reported as passing. Flutter, Dart and dependencies remain untouched.

Normative basis: [OpenAPI 3.2.1 sequential media](https://spec.openapis.org/oas/v3.2.1.html#sequential-media-types),
[RFC 7464](https://www.rfc-editor.org/rfc/rfc7464.html),
[WHATWG SSE parsing/dispatch](https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream),
and [RFC 2046 multipart](https://www.rfc-editor.org/rfc/rfc2046.html#section-5.1).

### Reconciliation after W5.01/W5.02 (historical; superseded by final W5 reconciliation below)

| Existing register entry | Actual source status after this increment | Concrete remaining boundary |
| --- | --- | --- |
| W4.01 and W4.04/W4.05 | SOURCE COMPLETE, unverified within their handoffs | Their shared finite codecs, typed multipart, XML/Linkset/Header/example/case paths remain in place; acceptance is still held. |
| W5.01/W5.02 | SOURCE COMPLETE, unverified as recorded above | Execute registered Engine/Core/widget/CLI/mock journeys only after authorization; retain explicit proof/resource limits. |
| W5.03 CONNECT mocks | Missing | Ordinary-response mocks still explicitly refuse CONNECT. Application/mock authority-form routing, approved bounded peers/tunnel ownership, bidirectional bytes, cancellation/closure and native/CLI qualification remain required. Existing client HTTPS-proxy CONNECT support does not implement this mock capability. No CONNECT work was started. |
| W5.04 broader mock generation | Partial | JSON, XML/Linkset, form/multipart and now finite JSONL/JSON-seq/SSE use captured samples/shared codecs/final proof. Schema-driven raw-binary witness construction and arbitrary pattern-constrained strings do not have a general constructive guarantee; the current string suggestions are authored samples plus bounded empty/repeated a/A/0 candidates. Recursive/dynamic/conditional combinations and large conjoined constraints remain bounded candidate search with original-schema proof, not a complete satisfiability solver. A failed search/unsupported representation must remain unavailable evidence. Existing 256-candidate/8 MiB/32768-work/depth bounds remain; broader witness and media qualification is still open. |

This reconciles the existing register; it does not authorize or automatically
start another implementation, migration or refactoring sequence. Overall BusyAPI
SOURCE COMPLETE and ACCEPTED are not claimed.


## Final W5.03/W5.04 handoff — native mocks and stream proof (2026-11-10)

**W5.03 and W5.04: SOURCE COMPLETE, unverified within the supported classes and
explicit boundaries below.** Work started at
`789e27855215f302ad0c1e51bbe25587f13770f0` on `release/v0.1.0` in the primary
checkout. This supersedes the earlier CONNECT refusal and partial witness status.
It does not declare BusyAPI SOURCE COMPLETE or ACCEPTED. The execution hold and
Snapcraft skip remain active; no dependency, SDK, lock or third-party source changed.

### Final streaming proof

`stream_execution.ts` now identifies a resolvable record only when its sole missing
proof is the captured MIME whole-context binding (`runtime.stream.part.unavailable`),
all its incomplete evaluations have that supported deferral reason, and there is
no independent Media Type `itemSchema`. Core retains a cumulative count separately
from the 128-record evidence window, so eviction cannot change aggregate results.
`ContractStreamSnapshot.withWholeResult()` promotes only that explicit subset and
only on complete, valid original body evidence after actual EOF/framing/decoding.
Its caller checks actual response-body evaluations and their producer/configuration;
a summary success, absent evaluations, resource limit or unrelated header proof
cannot discharge an item. Independent item schemas, unavailable codecs/evaluations,
binary item restrictions and unrelated warnings retain their status and severity.
The exact mock/proxy streaming adapter uses the same restricted disposition.

### CONNECT transport and approval policy

`mock_connect.ts` is attached to Node's supported HTTP server `connect` event.
The existing original-method transport and canonical operation projection remain
owners; uppercase `CONNECT` is never rewritten to an ordinary response method.
Lowercase/custom identities remain case-sensitive ordinary operations. Each approved
authority selects exactly one existing captured path's `additionalOperations/CONNECT`,
including shared Path Item provenance, effective security and request constraints.
Header/query/cookie requirements are evaluated through existing native owners;
required HTTP bodies and unrepresentable path constraints refuse before connecting.

No policy means no approved destinations. A captured `mock.tunnels` configuration
must name 1–32 exact `host:port` authorities, each with its operation path and an
explicit pinned IP. All four resource limits are mandatory. Policy rejects
wildcards, URLs/userinfo/path/query/fragment targets, missing/zero/out-of-range
ports, ambiguous duplicate authority owners and IP-authority/pin disagreements.
The socket connects directly to the approved IP/port without DNS acquisition or
fallback and checks its effective remote address/port before the tunnel transition.
The listener remains `127.0.0.1`; existing project access/capture boundaries remain.

Example configuration (a policy example, never an installed default):

```yaml
mock:
  tunnels:
    destinations:
      - path: /tunnel
        authority: approved.test:9443
        address: 127.0.0.1
    maximumTunnels: 2
    maximumBytes: 1048576
    idleTimeoutMs: 2000
    durationMs: 10000
```

The maximum allowed bounds are 32 simultaneous tunnels (including validation and
connection establishment), 64 MiB of combined duplex bytes per tunnel, 60 seconds
idle and 300 seconds lifetime. The detached initial `head` is bounded to 64 KiB;
bytes enter the same metered stream before subsequent client bytes. Stream piping
owns backpressure and each direction's FIN independently. Peer refusal, disconnect,
byte/time limits and cancellation close owned sockets. Server shutdown explicitly
aborts upgraded sockets, which HTTP `closeAllConnections()` does not own.

A successful captured 2xx (or applicable `2XX`/default instantiated as 200) is sent
only after peer connection and native status/Header proof. It sends neither HTTP
response content nor Content-Length/Transfer-Encoding. Primitive simple Headers
(including authored/ref/external examples) and existing content Header codecs are
supported; unconstructed structured simple values, unsafe non-ASCII/control fields, oversized generated
Headers and incompatible required framing Headers return located unavailable
results. No unsupported tunnel is converted into an ordinary successful response.
Request refusal uses a non-2xx empty HTTP response and never opens a destination.

`tunnel-established`, `tunnel-refused` and `tunnel-terminated` are distinct captured
machine events, with `responseBody: not-applicable`, original source ownership and
no credential or payload logging. Core retains 64 events, native review retains the
latest lifecycle outcome after Stop, and CLI `mock --json` emits lifecycle records
after readiness. Shutdown drains event output before CLI/subscription teardown.
Startup, Stop/cancel, configuration capture, source staleness and restart continue
through existing `MockPlan`/`MockRun` and native controls.

Normative/API basis: [RFC 9110 §9.3.6](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.6),
[Node 24 HTTP connect](https://nodejs.org/docs/latest-v24.x/api/http.html#event-connect)
and [Node 24 Socket](https://nodejs.org/docs/latest-v24.x/api/net.html#class-netsocket).

### Constructive mock witnesses and honest unavailable results

Existing captured examples/defaults, finite enum/modern const values and exact
numeric bounds/lattices remain authoritative suggestions. Media examples retain
precedence, including serialized/external bytes and text charset selection. Native
sample construction now additionally proposes:

- Strings from bounded literal/escaped sequences, positive character classes and
  ranges, dot seeds, ordinary/noncapturing groups, alternation, anchors, and
  `?`, `*`, `+`, exact/bounded/open repeat counts. Supported escapes include
  `d`, `w`, `s`, newline/tab/return, fixed hex/Unicode and escaped punctuation.
  Conjoined captured length bounds inform construction. The parser proposes
  values; it never evaluates schema validity or executes authored regexes.
- Object required/minimum/optional/additional-property candidates, dependency
  closure and exact parent/alternative merges; array conjoined length, positional,
  containment and distinct finite proposals retain their shared constructor.
- Finite `if`/`then`/`else` and dependent-schema object fragments merged with parent
  requirements, plus primitive/empty termination proposals at recursive edges.
  Parent construction and original proof determine whether a finite witness exists.
- Text and known raw-binary media candidates, including exact captured string
  witnesses, supported charset encoding and bounded zero/ASCII byte lengths from
  captured length/alternative/negation constraints. Modern binary `maxLength` is
  proved on decoder-owned octets; it is not JSON null/string evidence. Encoded
  whole-body strings retain their established original-schema/media semantics.

Every selected candidate is proved by the existing original captured-schema
worker, and the existing native status/Header/body check runs before successful
mock emission. JSON alternative proof remains JSON-only; wire candidates use
separate original media instances in bounded batches. No new evaluator or Prism
modification is introduced. Exact source numeric tokens remain the emitted JSON.
W4 XML/Linkset/form/multipart, named examples and finite JSONL/JSON-seq/SSE continue
through their existing codecs and final original proof.

The existing limits remain 256 candidates, 8 MiB candidate data, 32768 construction
steps and 128 schema depth (with existing codec/evaluator bounds). Pattern text is
limited to 4096 characters and constructed repeats/byte lengths to 65536; finite
conditional object combinations retain at most 64 merged proposals. Lookarounds,
backreferences, Unicode properties, negated classes and arbitrary regex intersections
have no general constructor. Neither arbitrary dynamic-reference solutions nor
mandatory infinite recursion/conflicting schemas are promised. Content annotations
do not become an invented decoded-content validator. Unsupported representation,
incomplete original evaluation and exhausted search return precise unavailable
codes (`mock.sample.pattern.unavailable`, `.unchecked`, `.limit`, `.unavailable`
or `.media.unavailable`); exhaustion is never reported as unsatisfiability.

### Changed production owners and producer admission

- Engine: `mock_connect.ts` and `schema_string_candidates.ts` (new);
  `mock_server.ts`, `mock_native_validation.ts`, `mock_response_validation.ts`,
  `mock_generation_adapter.ts`, `mock_schema_samples.ts`, `mock_response_examples.ts`,
  `schema_sample_candidates.ts`, `stream_execution.ts`, `mock_stream_response.ts`,
  `runtime_stream.ts`, `schema_evaluation.ts`, `execution.ts`. The existing
  `mock_operations.ts` and `mock_method_transport.ts` remain the captured operation
  and parser owners used by the new transport.
- Core: `mock.dart`, `request_stream.dart`, `request.dart`, `execution.dart`,
  `project.dart`; CLI: `packages/busyapi_core/bin/busyapi.dart`;
  native: `lib/src/workspace/mock_run.dart`. Test runtime injection uses the same
  Core start entry point and defaults to the existing packaged assets.
- Canonical schema producer is now `hyperjump+busyapi-exact` **1.18.0+67**, with
  **incremental-stream-v2**. Core admits exactly that schema revision. Stream
  protocol/request representation revision is **2**; report producer remains
  `busyapi-incremental-stream` **1** with canonical schema identity attached.
- Native sample producer advances to **5**, configuration
  `captured-schema-candidates-v5:<canonical configuration>`. New tunnel producer:
  `busyapi-native-tunnels` **1**, `approved-pinned-peers-v1`. Response **5**,
  parameter **6**, security **1**, method **1**, multipart **2**, schema examples
  **3**, XML/Linkset **2**, contract-test report **4** and migration **104** retain
  their identities. Obsolete schema **+66**, candidate **4**, missing/obsolete
  tunnel identity and stream revision **1** are not accepted as shortcuts.

### Registered regression sources — prepared, not run

`tools/build_engine.sh` explicitly registers new `test_mock_connect.cjs` and
`test_mock_constructive_witnesses.cjs`. The former drives actual mock subprocesses
and controlled local TCP peers: malformed/valid authority syntax, approved/denied
peers and pin mismatch, native security/parameters/required-body/status refusal,
initial buffered binary bytes, duplex traffic/backpressure, half-close, concurrent
tunnels/capacity, disconnect, idle/lifetime/byte limits, cancellation/shutdown,
peer refusal and ordinary HTTP. Existing `test_mock_custom_methods.cjs` retains
canonical additional-operation/case/shared source coverage, adds lowercase
`connect`, and now checks refusal at request time rather than obsolete startup
refusal. Producer/generation fixture expectations are synchronized.

`test_mock_constructive_witnesses.cjs` covers four families, patterns/lengths,
finite/exact values, object/array composition/distinct values, finite conditionals,
recursive termination, binary lengths/encoded strings, media-example precedence,
conflicting/unsupported/unbounded negative witnesses, source retention and original
final response proof. Existing numeric, nested, lifecycle, negotiation, media,
external example and W4 suites remain registered. `test_incremental_streaming.cjs`
and `test_streaming_mock_proxy.cjs` add actual deferred MIME binding/final proof
controls; independent/binary/limit coverage is retained.

Core `mock_connect_test.dart` drives actual `prepareMock`/`start`, socket exchange,
policy/configuration staleness, source identity, generation, cancellation and independent packaged CLI JSON
lifecycle/witnesses. `mock_connect_support.dart` supplies controlled peers only.
`incremental_stream_execution_test.dart` adds 150-record evidence eviction, actual
whole-body success beside independently unavailable item/codec/limit evidence,
controlled incomplete/omitted worker results around actual production execution,
original deferred MIME proof and unavailable binary items. The existing production
media fixture accepts an optional controlled Engine for those fault regressions.
`mock_readiness_revision_test.dart` and Engine producer-consistency checks retain
old-producer rejection. Native `test/mock_connect_workflow_test.dart` uses actual
workspace/mock controls, peer bytes, witness requests, lifecycle review/Stop and
source retention. Core and standard/local native widget directory discovery in
`tools/build_linux.sh`/`tools/test_widgets_local.sh` register these files, including
CLI journeys. No prepared regression is reported as passed.

### Remaining BusyAPI product requirements after W5

| Existing requirement | Reconciled source status | Remaining product/qualification boundary |
| --- | --- | --- |
| W4.01, W4.03–W4.05 | Retain source-complete, unverified bounded media/field implementations | Current revision execution, native/package/CLI qualification and documented codec limits remain; this work does not remove codecs or simplify authored contracts. |
| W5.01–W5.04 | Source-complete, unverified within their handoffs, including this final-proof correction | Run all registered Engine/Core/native/CLI regressions only after explicit authorization lifts the hold. Constructor/proof unavailability and explicitly unapproved tunnel peers remain intentional bounded refusals. |
| W1 native Design/Source/Reference and semantics | Bounded schema/reference authoring completion retained; complete field/position/family qualification remains U/P in existing rows | Reconcile native surface coverage and actual gaps, including operation/security/device-flow and complete rendered/reference contexts, against the existing W1 rows; held tests are not evidence that controls are missing. |
| W4.02, W4.06–W4.07 | Existing parameter/external-byte implementations retained, with explicit occurrence/selection boundaries | Occurrence-specific serializations and binary Parameter/Header/part choices still require closure as already recorded; occurrence-free reusable media cannot guess context. |
| W6 maintenance and W6.04 documentation/export/adapters | Existing W6-M1/M2 bounded completions retained; general schema-position/mixed-role and full export/relocation qualification remain open | These are existing product requirements, not an instruction to resume W6 or create another migration sequence. |
| W2/W3 migration | Existing bounded completions and recorded gaps remain unchanged | B05 and advanced migration work remain parked. Only evaluator expectation fixtures changed here; no migration algorithm or contract mapping was resumed. |
| W7 integration/professional journeys | Shared capture/review/stale/history/publication controls retained and W5 paths connected | Complete native-family/authenticated/packaged journeys remain unaccepted. New mock events retain source ownership and redact displayed paths without recording credentials/payloads. |
| W8 evidence/acceptance | Held, no new accepted evidence | Compilers, analyzers, builds, generation, tests/CI, graphical/performance and installed/package acceptance have not run; independent SDK/evidence prerequisites and normal Quit qualification remain, and Snapcraft stays skipped. |

**Verification actually performed:** source reads/searches, official RFC/Node API
consultation, production-path/producer/gate review, Git state inspection and
`git diff --check` only. No tests, compilation, analysis, build, generation, CI,
graphical/performance or Snapcraft workload ran. Generated Engine bundles and installed/test runtimes were not rebuilt;
held acceptance requires rebuilding these source revisions first. Coherent changes are committed
locally on the requested branch; no push is authorized or performed. Overall
BusyAPI SOURCE COMPLETE and ACCEPTED remain unmet. No next implementation sequence
is created or automatically started.
