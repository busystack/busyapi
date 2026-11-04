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
| W1.06 Request bodies and response/status/media relationships; O20 body/Response, O30/O31 named objects, O32 §§4.13–4.14/4.16–4.18 | operation/response/media owners, `runtime_media_owner.ts`, Core request | A R E M S C | bodyless/operation-body/response-status/media-selection suites | Partially implemented; same-family shared operation media now use entry-owned variants; newer fields and remaining inherited representations still need W2/W3 closure | H |
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
| W2.01 Per-use entry namespace, role, family/dialect, URI base, resource boundary, direction and independent literal uses; JC §§8–9, URI/TEXT | `migration_documents.ts`, `MigrationSource`, canonical graph | M S C | document-owner/direction/boolean-owner suites (existing); use-capture controls in document-owner suite | Partially implemented; planning contexts now retain these use records; retrieval bookkeeping no longer creates false conflicts; pure static forwarders share a proved representation across modern entry dialects; differing unversioned schemas/native components now acquire common entry owners through typed containment and reference closure; whole identified resources and implicit boundaries receive independent collision-checked identities; implicit security/discriminator connections and Swagger/modern allOf named-model tables now seed the same closure; partial modern resources and native schema slots now share one proved holder; same-family foreign document uses now receive entry owners too; typed entry owners retain distinct parent roles; operation-name links materialize to exact captured URI targets when their operations acquire variants. Reviewed extract/move/inline, rename and explicit YAML independence reuse exact token ownership through native controls, Core transactions and CLI reviews; mixed-family components use compatible foreign native maps and partial resource holders. Entry-qualified reference/dynamic-candidate and context proofs follow terminal material owners across conversion/relocation, and owning-entry literal/secondary Schema views can specialize. Allocation first preserves map/document Schema views through the same role relation; assertions and polymorphic connections retain compatible named or anonymous holders. Mixed-family uses without a holder, other destination interpretations and refactoring roles still need algorithms | H |
| W2.02 One deterministic specialization mechanism, selected-consumer repair, collisions and provenance; JC resource/reference rules, family object clauses | `migration_schema_owners.ts`, migration direction/discriminator/identity/shared-text/examples, `migration_schema_uses.ts` | M E S C | alias/boolean/inactive annotation/direction suites, `test_migration_schema_uses`, `test_migration_object_uses`, Core `migration_schema_uses_test` / `migration_object_uses_test` and existing publication suites | Partially implemented; common allocator serves schema containers, boolean/annotation/condition/tuple/name owners and direction/discriminator states. Pre-conversion and patch-relocation ownership separates established schema and native object uses from data; repairs select intrinsic roles. Anchored/dynamic uses retain a proved existing resource through ordinary schema/object holders or their own retained $id. Native overlapping roles now use the same allocator and per-role static reference repair; Design, Reference, schema trees, examples and validation retain established interpretations. Independent native/schema URI contexts, intrinsic containment, meta roots and exact executable views retain the canonical source owner; role-selected Markdown bases survive scalar navigation. Cross-entry static forwarding and recursive/schema/Header ownership now propagate to each entry; whole identified/dynamic resources use entry-owned identity namespaces and active-owner conversion/relocation; entry namespaces, Swagger model tables and ordinary role/literal copies now use captured active contexts; partial modern schema/native-field resources share common material owners and captured slot references; model-sensitive map and whole-resource views now use neutral anonymous holders, including boolean alternatives, and forward proved native identified children through that same material-owner primitive; compatible foreign component maps preserve mixed-family source contexts through the same allocator and proofs; restricted Schema Object copies and conversion hoists now share anonymous array-item owners, captured entry contexts, passive URI preservation and common reservation/provenance/retirement; objects without a compatible holder and remaining resource/refactoring contexts still need algorithms | H |
| W2.03 Twelve directed routes and same-family patch behavior; family schema clauses, J4/JC applicators | `migration_routes.ts`, Swagger/schema/binary/direction owners | M S C | `test_migration_entry_routes`, `test_migration_direct_swagger`, `test_swagger_empty_tuple`, Core entry routes and `migration_direct_swagger_test.dart` | Partially implemented; Swagger-to-modern now bypasses 3.0, mapping positional items directly; empty tuples retain no-op meaning; full route qualification and shared-role cases remain | H |
| W3.01 Directional annotations and shared request/response/Header consumers in both directions; O20 Schema, O30 Schema, O31/O32 annotations | `migration_access.ts`, `migration_direction.ts`, required-presence owner | M E S C | direction/access/required-presence/Header suites and Core access review | Partially implemented; direct Swagger modern routes use existing specialization; active downgrade and mixed-entry ownership remain | H |
| W3.02 Positional tuples/tails, recursion, exact bounds and references; J4 §5.3, JC §10.3.1 | `migration_schema.ts`, routes and schema-reference owners | M E S C | direct-Swagger/empty-tuple/migration suites and `test_migration_tuple_tails` | Partially implemented; unbounded Swagger tails upgrade to modern `prefixItems`; finite constrained modern tails expand to bounded Swagger positions referencing one retained tail owner; bounds now include same-instance composition, fixed references, finite enum/const values, non-array types, unreachable prefixes and constant containment counts; independent boolean tails retain owners too; unbounded constrained tails and additional equivalent downgrade algorithms remain | H |
| W3.03 Conditional assertions and inactive conditional fields; JC §10.2.2 | `migration_schema_conditions.ts`, shared owner allocator, schema migration | M E S C | `test_migration_conditions` through production planning, source/target evaluations and cold graph | Partially implemented; modern-to-3.0 conditional lowering retains one condition target; annotation-free boolean/empty/fixed-reference conditions now select their faithful branch for either restricted family. Unconsumed inactive branches (including absent-if cases) are pruned before vocabulary conversion; independent targets and connection/dynamic proofs remain owned. Nonconstant Swagger mappings, descendant-only inactive ownership and other overlapping cases remain open | H |
| W3.04 Property/schema dependencies with independently referenced maps; JC §10.2.2.4, JV §6.5.4 | `migration_schema_dependencies.ts` | M E S C | dependency/dependent-schema suites, Core dependency review | Partially implemented; existing conditional lowering retained; representable independent map schemas use W2.02 ownership; unknown annotations still cannot be silently dropped for restricted targets; remaining Swagger conditional mappings remain open | H |
| W3.05 Static/dynamic references, anchors, identities and independent annotations; JC §§8–9 | identity/schema-reference/role owners | M E S C | static-dynamicref/identity/boolean/inactive annotation suites, pinned official dynamicRef cases, Core static/dynamic reference publication/HTTP/CLI journeys | Partially implemented; inactive anchors and dynamic applicators whose captured candidates all identify the initial target lower through one shared binding proof. Sibling constraints and recursive references remain separate allOf/static edges; resource/role provenance and cold reopening are proved. Whole-resource entry variants retain static/dynamic targets, anchors and resource boundaries; downstream dynamic dependencies require a same-resource holder. Partial modern resources and native slots now receive common resource owners; moved definitions remain anonymous and native discriminator URI targets repair before stage validation; competing-target lowering and cross-document/mixed-family specialization remain implementation work | H |
| W3.06 Pattern/property-name/contains/count/unevaluated/content constraints; JC §§10–11, JV §§6/8 | `migration_schema.ts`, `migration_schema_property_names.ts`, binary/reference/dependency owners | M E S C | migration/binary/dependency suites (existing), `test_migration_property_names`, Core `migration_property_names_test.dart` | Partially implemented; finite annotation-free property-name enum/const/type restrictions now lower to an isolated closed-properties branch with retained independent owners; those same finite domains now lower pattern-selected value assertions through anonymous owners, including overlapping patterns and original additional-property exclusions; constant true/false containment now maps exact counts to array bounds and retains independent contains/unevaluated boolean owners; general name schemas, unbounded pattern domains, nonconstant containment and annotation-dependent unevaluated/content algorithms remain missing, with individual blockers | H |
| W3.07 Raw/data/base64/byte/file/union consumers and byte constraints; family binary clauses, JV §8 | `migration_binary.ts`, Swagger flat/media owners | M E S C | migration binary, direct Swagger, native binary suites | Partially implemented; direct Swagger route now inspects actual body/response media and modernizes flat bounds/byte encodings; mixed/constrained/file-union ownership remains | H |
| W3.08 Inherited media, forms/files, examples without schemas, shared operations/body meaning and reusable objects; family object clauses | Swagger media/form/downgrade/operation owners | M E S C | Swagger media/form/bodyless/ignored-body suites, Core form CLI | Partially implemented; retain existing mappings and safety decisions; same-family Swagger operations with differing inherited media use common entry owners; examples without schemas and remaining mixed-family shared operations still have implementation gaps | H |
| W3.09 Servers/security/newer-version fields and invariant proof; family clauses, HTTP/URI | servers/security/operation/invariant owners | M E S C | default-server/security-role/entry-route suites, native-object-use publication and URI-key controls | Partially implemented; 3.2 URI security bindings now retain separate role arrays through owner specialization and portable relocation, with target/name-precedence proofs and declaration/scopes invariants. Complete remaining newer-field and multi-flow mappings without inventing extensions or loss modes | H |
| W3.10 Unsaved capture, stale review rejection, original preservation, inventories, exact external bytes, atomic publication and relocated verification; URI/TEXT, Core transaction contract | migration source/examples/invariants; Core `migration.dart` and publication owners | M S C | Core migration/derived-resource/publication suites, engine external examples | Partially implemented; existing safeguards now capture dependencies/opaque bytes for connected complete entries in their own contexts, publish all surviving native locators and retire only reviewed ignored uses; remaining restructuring proofs and current publication/cold-reopen acceptance are still required | H |

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
| W6.01 Rename/extract/copy/inline/relocate at every schema-bearing position; JC §§8–10, family Schema/Components clauses | refactoring/copy/file owners, canonical schema traversal, Core transactions | A R S C | refactoring/copy/extract/file/schema-definition suites | Partially implemented; reviewed extract, definition move, new-file extraction, inline and renames now share migration YAML token ownership, original-coordinate transactions and native controls. Rename reads alias-backed required/dependency/composition relationships through logical paths and owns only affected writes, including security fields/configuration. Explicit YAML independence retains all logical values and graph identities and enables subsequent ordinary native controls. CLI review/apply exposes existing object/file maintenance and operation/root moves through the same Core plans, captured file intents and grouped publication. Full schema-bearing-position and independently interpreted role coverage remains; current cold-reopen qualification is pending | H |
| W6.02 Preserve resource/dialect/anchor and dynamic evaluation scope without weakening recursion/identity/Path Item guards; JC §§8–9 | `refactoring_copy.ts`, reference choices/graph | A R S C | copy suite static-dynamic/dialect controls plus existing genuine dynamic/recursive refusals | Partially implemented; static dynamic-reference starting points and retained explicit dialects now have a guarded inline path; identified/dynamic resources and non-schema chains still need specific algorithms | H |
| W6.03 Shared/conflicting Markdown and dual literal/contract owners; TEXT/URI, O32 URI-base clauses | refactoring Markdown/file/copy, migration shared-text, URI owners | A R M S C | Markdown identity/location/shared-text/refactoring suites, native-object-use migration controls | Partially implemented; reviewed copy/inline now separate YAML aliases before the existing Markdown/URI proofs and preserve literal alias values. Migration schema/data and native object/data owners are retained; general refactoring and incompatible entry/rendering-base specializations remain missing | H |
| W6.04 Complete native Reference/export and exact pinned external renderer/generator/comparator adapters; family clauses, PINS | native Reference, `derived_bundle.ts`, Core renderer/export adapters | R M S C | reference family/display/Markdown, bundle/resource-package/adapter suites | Partially implemented; native family paths exist; complete relocated/offline output and exact adapter limitation qualification remain; never strip/relabel source to satisfy an adapter | H |
| W7.01 Creation, editing, unsaved Reference, request/example/mock/case, migration review, documentation and CLI integration for every capability; all applicable clauses above | shared engine, Core owners and native workspace controls | A R E M S C | engine/Core/widget/native journey suites | Partially implemented; applicable existing consumers inherit shared field/codec/routing changes; complete family journeys are not accepted | H |
| W7.02 Stale-action invalidation on declaration/dialect/root/external/approval changes; coherent reviewed transactions, Undo/Redo and no buffer loss; Core transaction contract | Core project/store/capture and native review/request controllers | A R E M S C | stale capture/cancellation/publication/widget review suites | Partially implemented; existing source for existing safeguards; new paths require current integration qualification | H |
| W7.03 CST fidelity, no-op saves, exact values, aliases, extensions and source-only migration restructuring; TEXT | `document.ts`, graph/CST editing, Core store/transaction owners | A R M S C | source ownership/alias/exact-value/no-op suites | Partially implemented; existing source for existing boundaries; generated schema owners retain original provenance and reviewed restructuring | H |
| W7.04 Typed bounded owners, revision admission, obsolete-proof rejection and official unmodified dependencies; PINS | engine producer metadata, Core `project.dart`, mock readiness, native preflight | A R E M S C P | mock revision/readiness, Core runtime-parameter proof and migration producer consistency regressions | Partially implemented; existing source for scoped revision update: schema evaluator `1.18.0+58`, migration producer `69`, response/parameter mock producers `4`, numeric sample producer remains `3`; no dependency versions/source changed | H |
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

Partial schema resources and native uses lacking an ordinary
component holder retain the precise `migration.owners.entry-resource`
implementation refusal. This is unfinished ownership work, not a claim of
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
provenance and publication proofs remain mandatory. Swagger model registries, foreign objects without a proved holder and
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
