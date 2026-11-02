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

## Finite completion register

This register is the implementation queue. Its rows take precedence over the
historical summaries below. **No work package is accepted or source-complete.**
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
| W1.06 Request bodies and response/status/media relationships; O20 body/Response, O30/O31 named objects, O32 §§4.13–4.14/4.16–4.18 | operation/response/media owners, `runtime_media_owner.ts`, Core request | A R E M S C | bodyless/operation-body/response-status/media-selection suites | Partially implemented; inherited/shared object migration and newer fields still need W2/W3 closure | H |
| W1.07 Media examples, reusable 3.2 media, `itemSchema`, named/positional/nested Encoding and example-value fields; O32 §§4.14–4.15/4.19 | media/form/multipart owners, `example_representation.ts`, `serialized_examples.ts` | A R E M S C | generic/positional multipart, data-value, example completeness and external-resource suites | Partially implemented; metadata and finite decoding exist; typed generation, streaming and XML/Linkset remain open | H |
| W1.08 Reusable component families and reference eligibility; O20 reusable maps, O30/O31 Components, O32 §4.7 | `authoring.ts`, graph/reference choices, native object controls | A R E M S C | native family/reference position/component-name suites | Partially implemented; existing source for existing component contexts; qualify each applicable field and consumer, including media occurrences | H |
| W1.09 Restricted schemas versus modern vocabularies, boolean schemas, exact numbers and annotations; O20 Schema, O30 Schema, O31/O32 Schema, J4/JC/JV | restricted/structural validators, `schema_evaluation.ts`, schema resource/access owners | A R E M S C | restricted-required, schema-role/definition/property-access/evaluation suites | Partially implemented; schema evaluation is implemented; authoring and mapping coverage must be closed independently of structural validity | H |
| W1.10 Reference Objects, schema applicators, Path Item references and ignored siblings; family reference clauses, JC §8.2.3 | `contexts.ts`, `reference_graph.ts`, reference projections/choices | A R E M S C | reference-family/position/path-item/context suites | Partially implemented; existing source for existing contextual boundaries; retain negative payload/reference-lookalike controls | H |
| W1.11 Links, runtime expressions, callbacks and webhooks; O30/O31/O32 named object clauses | runtime-expression/link/graph owners, authoring and reference projections | A R E M S C | graph/reference/operation-maintenance suites (existing) | Partially implemented; complete field/surface qualification and representable maintenance/migration coverage remain | H |
| W1.12 Tags, summary/kind/parent, entry namespaces and cycles; O32 Tag Object | `authoring_relationships.ts`, authoring, native Reference | A R M S C | `test_relationships`, reference-family suites | Partially implemented; existing source for existing parent/duplicate/cycle rules; downstream migration still incomplete | H |
| W1.13 Security URI bindings, roles, OAuth metadata/device flow and added fields; O32 Security Scheme/OAuth Flow/Security Requirement objects | security owners, graph connections, Core request/security controls | A R E M S C | security-role/selection/URI-binding suites | Partially implemented; native semantics exist; faithful scheme splitting and newer-field downgrade mappings remain | H |
| W1.14 XML node types/names/namespaces and discriminator defaults; **O32 §§4.25–4.26**, O20/O30/O31 corresponding objects | `xml_semantics.ts`, discriminator alternatives/models, authoring | A R E M S C | XML names/namespaces, discriminator alternatives/defaults and negative optional-3.0 suites | Partially implemented; existing corrections retained; XML wire mapping is W4.04; optional 3.0 discriminators stay invalid | H |

### W2–W3: ownership, routing and explicit migration

| ID / requirement and authority | Production owner | Surfaces | Prepared regression coverage | Implementation status / remaining closure | Executed acceptance |
| --- | --- | --- | --- | --- | --- |
| W2.01 Per-use entry namespace, role, family/dialect, URI base, resource boundary, direction and independent literal uses; JC §§8–9, URI/TEXT | `migration_documents.ts`, `MigrationSource`, canonical graph | M S C | document-owner/direction/boolean-owner suites (existing); use-capture controls in document-owner suite | Partially implemented; planning contexts now retain these use records; retrieval bookkeeping no longer creates false conflicts; pure static forwarders share a proved representation across modern entry dialects, while other differing uses still need specialization | H |
| W2.02 One deterministic specialization mechanism, selected-consumer repair, collisions and provenance; JC resource/reference rules, family object clauses | `migration_schema_owners.ts`, migration direction/discriminator/identity/shared-text/examples, `migration_schema_uses.ts` | M E S C | alias/boolean/inactive annotation/direction suites, `test_migration_schema_uses`, `test_migration_object_uses`, Core `migration_schema_uses_test` / `migration_object_uses_test` and existing publication suites | Partially implemented; common allocator serves schema containers, boolean/annotation/condition/tuple/name owners and direction/discriminator states. Pre-conversion and patch-relocation ownership separates established schema and native object uses from data; repairs select intrinsic roles. Anchored/dynamic uses retain a proved existing resource through ordinary schema/object holders or their own retained $id. Native overlapping roles now use the same allocator and per-role static reference repair; Design, Reference, schema trees, examples and validation retain established interpretations. Cross-entry namespace propagation and uses without a proved holder/boundary still need algorithms | H |
| W2.03 Twelve directed routes and same-family patch behavior; family schema clauses, J4/JC applicators | `migration_routes.ts`, Swagger/schema/binary/direction owners | M S C | `test_migration_entry_routes`, `test_migration_direct_swagger`, `test_swagger_empty_tuple`, Core entry routes and `migration_direct_swagger_test.dart` | Partially implemented; Swagger-to-modern now bypasses 3.0, mapping positional items directly; empty tuples retain no-op meaning; full route qualification and shared-role cases remain | H |
| W3.01 Directional annotations and shared request/response/Header consumers in both directions; O20 Schema, O30 Schema, O31/O32 annotations | `migration_access.ts`, `migration_direction.ts`, required-presence owner | M E S C | direction/access/required-presence/Header suites and Core access review | Partially implemented; direct Swagger modern routes use existing specialization; active downgrade and mixed-entry ownership remain | H |
| W3.02 Positional tuples/tails, recursion, exact bounds and references; J4 §5.3, JC §10.3.1 | `migration_schema.ts`, routes and schema-reference owners | M E S C | direct-Swagger/empty-tuple/migration suites and `test_migration_tuple_tails` | Partially implemented; unbounded Swagger tails upgrade to modern `prefixItems`; finite constrained modern tails expand to bounded Swagger positions referencing one retained tail owner; bounds now include same-instance composition, fixed references, finite enum/const values, non-array types, unreachable prefixes and constant containment counts; independent boolean tails retain owners too; unbounded constrained tails and additional equivalent downgrade algorithms remain | H |
| W3.03 Conditional assertions and inactive conditional fields; JC §10.2.2 | `migration_schema_conditions.ts`, shared owner allocator, schema migration | M E S C | `test_migration_conditions` through production planning, source/target evaluations and cold graph | Partially implemented; existing source for modern-to-3.0 conditional lowering with one retained condition target; Swagger condition-specific mappings and overlapping roles remain open | H |
| W3.04 Property/schema dependencies with independently referenced maps; JC §10.2.2.4, JV §6.5.4 | `migration_schema_dependencies.ts` | M E S C | dependency/dependent-schema suites, Core dependency review | Partially implemented; existing conditional lowering retained; representable independent map schemas use W2.02 ownership; unknown annotations still cannot be silently dropped for restricted targets; remaining Swagger conditional mappings remain open | H |
| W3.05 Static/dynamic references, anchors, identities and independent annotations; JC §§8–9 | identity/schema-reference/role owners | M E S C | static-dynamicref/identity/boolean/inactive annotation suites, pinned official dynamicRef cases, Core static/dynamic reference publication/HTTP/CLI journeys | Partially implemented; inactive anchors and dynamic applicators whose captured candidates all identify the initial target lower through one shared binding proof. Sibling constraints and recursive references remain separate allOf/static edges; resource/role provenance and cold reopening are proved. Competing-target scope specialization and shared uses without a proved holder remain implementation work | H |
| W3.06 Pattern/property-name/contains/count/unevaluated/content constraints; JC §§10–11, JV §§6/8 | `migration_schema.ts`, `migration_schema_property_names.ts`, binary/reference/dependency owners | M E S C | migration/binary/dependency suites (existing), `test_migration_property_names`, Core `migration_property_names_test.dart` | Partially implemented; finite annotation-free property-name enum/const/type restrictions now lower to an isolated closed-properties branch with retained independent owners; constant true/false containment now maps exact counts to array bounds and retains independent contains/unevaluated boolean owners; general name schemas, patterns, nonconstant containment and annotation-dependent unevaluated/content algorithms remain missing, with individual blockers | H |
| W3.07 Raw/data/base64/byte/file/union consumers and byte constraints; family binary clauses, JV §8 | `migration_binary.ts`, Swagger flat/media owners | M E S C | migration binary, direct Swagger, native binary suites | Partially implemented; direct Swagger route now inspects actual body/response media and modernizes flat bounds/byte encodings; mixed/constrained/file-union ownership remains | H |
| W3.08 Inherited media, forms/files, examples without schemas, shared operations/body meaning and reusable objects; family object clauses | Swagger media/form/downgrade/operation owners | M E S C | Swagger media/form/bodyless/ignored-body suites, Core form CLI | Partially implemented; retain existing mappings and safety decisions; examples without schemas and mixed shared operations still have implementation gaps | H |
| W3.09 Servers/security/newer-version fields and invariant proof; family clauses, HTTP/URI | servers/security/operation/invariant owners | M E S C | default-server/security-role/entry-route suites, native-object-use publication and URI-key controls | Partially implemented; 3.2 URI security bindings now retain separate role arrays through owner specialization and portable relocation, with target/name-precedence proofs and declaration/scopes invariants. Complete remaining newer-field and multi-flow mappings without inventing extensions or loss modes | H |
| W3.10 Unsaved capture, stale review rejection, original preservation, inventories, exact external bytes, atomic publication and relocated verification; URI/TEXT, Core transaction contract | migration source/examples/invariants; Core `migration.dart` and publication owners | M S C | Core migration/derived-resource/publication suites, engine external examples | Partially implemented; existing source for existing safeguards; every new restructuring still needs source-to-target mapping arguments and current publication/cold-reopen acceptance | H |

### W4–W5: wire representations and execution

| ID / requirement and authority | Production owner | Surfaces | Prepared regression coverage | Implementation status / remaining closure | Executed acceptance |
| --- | --- | --- | --- | --- | --- |
| W4.01 Named/ordered/nested multipart generation and decoding, typed/file/union choice, dynamic encoding, media/headers/transfers and exact bytes; O32 Encoding, MIME | runtime form/multipart/encoding owners; Core `request.dart`; native Request | A R E S C | generic/positional/nested/multipart-header/file-shape suites | Partially implemented; finite decoding exists; typed ordered/nested generation and captured choice controls are still missing in Core/native paths | H |
| W4.02 Parameter styles, collectionFormat, whole-query content, omission/empty/reserved/Unicode/exact numbers; family Parameter clauses, URI/WIRE | parameter/header codecs, Core request controls | A E S C | parameter/style/optional serialized/Swagger header suites, `test_runtime_parameter_serialization`, Core runtime-proof/external-parameter suites | Partially implemented; complete parameter serializations now evaluate through their captured declaration in Core execution; original Swagger flat/Items rules, exact numbers and header octets are retained; remaining occurrence-specific representations still need closure | H |
| W4.03 Repeated content/style field lines and Set-Cookie; HTTP §§5.2–5.5, O32 §4.21, RFC 6265 | `http_field_lines.ts`, runtime/MIME/parameter owners; Core `response_field_capture.dart`, connection adapter, `proxy_tls_socket.dart`; exact mock proxy | A R E S C | runtime header, mock header/parameter/exact-proxy suites; Core `repeated_header_fields_test`, `response_field_capture_test`, `http_proxy_transport_test`, response-header/CLI suites | Source-complete, unverified; known field definitions authorize ordered list combination; known singleton repeats are invalid; unknown repeated extensions remain separate and incomplete. Core captures original fields before SDK replacement, including HTTP proxy forwarding and verified HTTPS proxy tunnels. SDK proxy resolution/authentication and HTTP parsing remain authoritative; selected trust, hostname/client certificates, cancellation and standard HEAD semantics remain owned. Capture above 64 KiB or unsupported folding is explicitly incomplete | H |
| W4.04 OAS XML data/wire mapping, namespaces/order/escaping and disabled external acquisition; O32 §4.26, XML/Namespaces | XML semantics plus runtime-media/Core codec integration | A R E S C | XML metadata suites only; wire coverage still required | Missing for modeled wire encoder/decoder across consumers; opaque bytes remain available with truthful evaluation limits | H |
| W4.05 Linkset-to-JSON-model mapping; O32 §4.21.2, RFC 9264/8288/8187 | runtime-media/header codecs and request/mock integrations | A R E S C | wire regression coverage still required | Missing; `application/linkset` remains opaque | H |
| W4.06 Parameter/Header externalValue occurrence serialization through approved captured bytes; O30/O31/O32 Example/Parameter/Header objects | `serialized_examples.ts`, serialized-parameter evaluator, `execution.ts`, Core captured-resource owner | A R E S C | external-example-resource and serialized-parameter suites; Core `external_parameter_examples_test.dart` and existing external-resource controls | Partially implemented; evaluation, request-selection projection and Core outgoing validation now reuse captured resources and actual occurrences, including header octets/charsets; query/header production byte-exchange regressions are prepared; acceptance remains pending | H |
| W4.07 Concrete occurrence context, approved external/binary example selection and cache/decision ownership; Example clauses, Core capture contract | external/media/example/request owners | A R E M S C | external-resource/media-identity/binary-selection suites | Partially implemented; reusable media without a concrete occurrence remains missing context, not a guessed format; finish binary choices in every applicable native control | H |
| W5.01 Incremental JSON Lines/NDJSON, JSON text sequences and SSE framing/evaluation; O32 media/itemSchema, WIRE | runtime media plus transport/capture/Core/native/CLI stream owners | E S C | finite runtime-media suites only; incremental production regressions still required | Missing for transport-integrated incremental evaluation/backpressure/progress; complete-input accumulation is not streaming | H |
| W5.02 Multipart sequences, chunk boundaries, cancellation/bounds/retention, malformed/truncated terminal status and whole-sequence versus item results; MIME/WIRE | multipart runtime and stream transport/capture owners | E S C | finite multipart suites only; incremental byte-exchange coverage still required | Missing for incremental execution integration; retain bounded finite decoding | H |
| W5.03 Authority-form CONNECT, successful tunnel transition, bounded approved peers, bidirectional bytes and closure; HTTP §9.3.6 | mock native validation/server/transport; Core/native mock ownership | E S C | current tunnel refusal controls only; controlled peer byte-exchange suites still required | Missing; ordinary-response mock transport still refuses CONNECT; no unrestricted proxy is authorized | H |
| W5.04 Bounded object/array/composition/reference/media-aware generated witnesses and final original-schema/status/header/body proof; JC/JV, family response clauses | schema sample candidates, mock sample/generation/response owners | E S C | numeric/nested/schema-sample/media/final-response suites | Partially implemented; exact numeric and final-proof fixes retained; remaining candidate paths are incomplete; exhausted search is not unsatisfiability | H |

### W6–W8: maintenance, integration and qualification

| ID / requirement and authority | Production owner | Surfaces | Prepared regression coverage | Implementation status / remaining closure | Executed acceptance |
| --- | --- | --- | --- | --- | --- |
| W6.01 Rename/extract/copy/inline/relocate at every schema-bearing position; JC §§8–10, family Schema/Components clauses | refactoring/copy/file owners, canonical schema traversal, Core transactions | A R S C | refactoring/copy/extract/file/schema-definition suites | Partially implemented; full nested/conditional/dependency/tuple/media/callback coverage remains; source transaction/cold-reopen qualification pending | H |
| W6.02 Preserve resource/dialect/anchor and dynamic evaluation scope without weakening recursion/identity/Path Item guards; JC §§8–9 | `refactoring_copy.ts`, reference choices/graph | A R S C | copy suite static-dynamic/dialect controls plus existing genuine dynamic/recursive refusals | Partially implemented; static dynamic-reference starting points and retained explicit dialects now have a guarded inline path; identified/dynamic resources and non-schema chains still need specific algorithms | H |
| W6.03 Shared/conflicting Markdown and dual literal/contract owners; TEXT/URI, O32 URI-base clauses | refactoring Markdown/file/copy, migration shared-text, URI owners | A R M S C | Markdown identity/location/shared-text/refactoring suites, native-object-use migration controls | Partially implemented; YAML alias separation retained; schema/data and native object/data occurrences now separate before migration Markdown relocation; refactoring and incompatible entry/rendering-base specializations remain missing | H |
| W6.04 Complete native Reference/export and exact pinned external renderer/generator/comparator adapters; family clauses, PINS | native Reference, `derived_bundle.ts`, Core renderer/export adapters | R M S C | reference family/display/Markdown, bundle/resource-package/adapter suites | Partially implemented; native family paths exist; complete relocated/offline output and exact adapter limitation qualification remain; never strip/relabel source to satisfy an adapter | H |
| W7.01 Creation, editing, unsaved Reference, request/example/mock/case, migration review, documentation and CLI integration for every capability; all applicable clauses above | shared engine, Core owners and native workspace controls | A R E M S C | engine/Core/widget/native journey suites | Partially implemented; applicable existing consumers inherit shared field/codec/routing changes; complete family journeys are not accepted | H |
| W7.02 Stale-action invalidation on declaration/dialect/root/external/approval changes; coherent reviewed transactions, Undo/Redo and no buffer loss; Core transaction contract | Core project/store/capture and native review/request controllers | A R E M S C | stale capture/cancellation/publication/widget review suites | Partially implemented; existing source for existing safeguards; new paths require current integration qualification | H |
| W7.03 CST fidelity, no-op saves, exact values, aliases, extensions and source-only migration restructuring; TEXT | `document.ts`, graph/CST editing, Core store/transaction owners | A R M S C | source ownership/alias/exact-value/no-op suites | Partially implemented; existing source for existing boundaries; generated schema owners retain original provenance and reviewed restructuring | H |
| W7.04 Typed bounded owners, revision admission, obsolete-proof rejection and official unmodified dependencies; PINS | engine producer metadata, Core `project.dart`, mock readiness, native preflight | A R E M S C P | mock revision/readiness, Core runtime-parameter proof and migration producer consistency regressions | Partially implemented; existing source for scoped revision update: schema evaluator `1.18.0+50`, migration producer `46`, response/parameter mock producers `4`, numeric sample producer remains `3`; no dependency versions/source changed | H |
| W8.01 Explicit independent evidence input across SDK/build/CMake/CI/installed/package checks; PINS | `flutter_archive.py`, SDK verifier, `build_linux.sh`, CMake, package/native-distribution/artifact-smoke inputs | P | `tools/test_flutter_sdk.py`, source-wiring regressions | Partially implemented; existing source for archive-input propagation; same existing evidence reaches installed checks; independent member pins remain an alternative; no SDK acquisition/replacement | H; actual evidence availability/authenticity has not been qualified |
| W8.02 Ordered gates, registration, source-version-valid fixtures and production-byte regressions; PINS and each row's authority | `tools/build_engine.sh`, Linux workflow, engine/Core/widget/native/package suites | P | new direct-Swagger/conditional/tuple-tail/constant-containment/property-name/runtime-parameter suites registered; existing TypeScript-before-bundle gate retained | Partially implemented; compilation and all suspended gates remain unexecuted; missing regression coverage identified in this register remains implementation work | H |
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
proofs. Evaluator 1.18.0+50 and response/parameter mock producers 4 agree across
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
Evaluator `1.18.0+50`, graph role rules `2` and migration producer `46` invalidate
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

## Required functionality still open

- Remaining independently interpreted literal and cross-entry directional ownership;
  request/response specialization in faithful downgrade mappings.
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
