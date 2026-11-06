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

**In progress; not source-complete. All changes and regression sources remain
unverified.** This continuation started at
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

**Remaining B04 implementation and coverage requirements:**

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
| W3.07 Raw/data/base64/byte/file/union consumers and byte constraints; family binary clauses, JV §8 | `migration_binary.ts`, Swagger flat/media owners | M E S C | migration binary, direct Swagger, native binary suites | In progress, unverified; common owners now specialize containing/composed raw/data occurrences and fixed dynamic edges, canonical transfer discovery distinguishes encoded MIME strings, and raw octet bounds/length languages/empty equality preserve assertion behavior. Reverse predicates are projected before ordinary schema certificates. R1 containing-literal and bounded equivalence certificates are source-complete, unverified. Further file/media alternatives and the complete B04 transaction matrix remain R2/R3 work; see the handoffs above | H |
| W3.08 Inherited media, forms/files, examples without schemas, shared operations/body meaning and reusable objects; family object clauses | Swagger media/form/downgrade/operation owners | M E S C | Swagger media/form/bodyless/ignored-body suites, Core form CLI | Partially implemented; retain existing mappings and safety decisions; same-family Swagger operations with differing inherited media use common entry owners; examples without schemas and remaining mixed-family shared operations still have implementation gaps | H |
| W3.09 Servers/security/newer-version fields and invariant proof; family clauses, HTTP/URI | servers/security/operation/invariant owners | M E S C | default-server/security-role/entry-route suites, native-object-use publication and URI-key controls | Partially implemented; Retained 3.2 URI security bindings preserve separate role arrays through owner specialization and portable relocation, with target/name-precedence proofs and declaration/scopes invariants. Older-family URI-to-name source paths now allocate separate standard components through the shared allocator and additional typed-use provenance; external/aliased targets, name precedence, exact scope/role arrays and AND/OR order retain captured connection and request proofs. Shared URI requirements seed entry specialization even when their targets agree; source-side moves repair relative URI keys, and targets lacking Path Item component maps use common anonymous holders. Scheme Reference Object materialization retains applicable description overrides and their original Markdown bases. Captured environment aliases, exact manifest text/identity, Core stale/publication checks, native binding review and CLI output are implemented with prepared regressions; execution remains outstanding. Standard OAuth acquisition flows now specialize into one-flow Swagger schemes and ordered OR expansions without merging AND bindings or scope arrays. Compatible global environment selections project through captured effective security-array owners, intersect complete branch sets across operations, and preserve invalid-selection guards. Ignored Reference Object siblings retain full literal copies through the shared anonymous allocator; source formats/comments and exact values survive materialization. Non-OAuth roles in restricted targets, unavailable summary/discovery/device representations and flow metadata without a standard target container retain located blockers. Mixed-family ownership without compatible holders and remaining newer-field mappings remain implementation work | H |
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
| W4.07 Concrete occurrence context, approved external/binary example selection and cache/decision ownership; Example clauses, Core capture contract | external/media/example/request owners | A R E M S C | external-resource/media-identity/binary-selection suites | Partially implemented; reusable media without a concrete occurrence remains missing context, not a guessed format; native external body choices and saved-case/CLI execution now retain approved bytes through one owner-bound selection, including unchanged draft restoration and empty resources; captured external mock responses now retain the same approved byte ownership through negotiation and original response validation; binary Parameter/Header and part controls still need closure | H |
| W5.01 Incremental JSON Lines/NDJSON, JSON text sequences and SSE framing/evaluation; O32 media/itemSchema, WIRE | runtime media plus transport/capture/Core/native/CLI stream owners | E S C | finite runtime-media suites only; incremental production regressions still required | Missing for transport-integrated incremental evaluation/backpressure/progress; complete-input accumulation is not streaming | H |
| W5.02 Multipart sequences, chunk boundaries, cancellation/bounds/retention, malformed/truncated terminal status and whole-sequence versus item results; MIME/WIRE | multipart runtime and stream transport/capture owners | E S C | finite multipart suites only; incremental byte-exchange coverage still required | Missing for incremental execution integration; retain bounded finite decoding | H |
| W5.03 Authority-form CONNECT, successful tunnel transition, bounded approved peers, bidirectional bytes and closure; HTTP §9.3.6 | mock native validation/server/transport; Core/native mock ownership | E S C | current tunnel refusal controls only; controlled peer byte-exchange suites still required | Missing; ordinary-response mock transport still refuses CONNECT; no unrestricted proxy is authorized | H |
| W5.04 Bounded object/array/composition/reference/media-aware generated witnesses and final original-schema/status/header/body proof; JC/JV, family response clauses | schema sample candidates, mock sample/generation/response owners | E S C | numeric/nested/schema-sample/media/final-response suites | Partially implemented; exact numeric and final-proof fixes retained; optional/minimum-property objects, property-dependency closure, parent/alternative object merges, additional-property witnesses, conjoined array bounds, positional schemas and containment candidates now share bounded exact-fragment construction; media generation and remaining candidate paths are incomplete; exhausted search is not unsatisfiability | H |

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
| W7.04 Typed bounded owners, revision admission, obsolete-proof rejection and official unmodified dependencies; PINS | engine producer metadata, Core `project.dart`, mock readiness, native preflight | A R E M S C P | mock revision/readiness, Core runtime-parameter proof and migration producer consistency regressions | Partially implemented; existing source for scoped revision update: schema evaluator `1.18.0+58`, migration producer `85`, response mock producer `5`, parameter mock producer `4`, sample producer is now `4`; no dependency versions/source changed | H |
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
