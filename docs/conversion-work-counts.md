# Conversion work counts

Committed-source instrumentation compared `c4b40de` with `88bcc46`. These are
intermediate and final conversion-owner checkpoints within the simplification
work, rather than a comparison with the original release. Every row completed
conversion at both checkpoints.

| Captured operation | SourceDocument constructions before → after | MigrationSchemaOwners constructions before → after | Provenance inspections before → after | createGraph calls before → after |
| --- | ---: | ---: | ---: | ---: |
| OpenAPI 3.2.1 → 3.1.2 | 13 → 9 | 2 → 1 | 358 → 306 | 14 → 14 |
| OpenAPI 3.0.4 → 3.2.1 | 17 → 10 | 5 → 2 | 527 → 449 | 17 → 17 |
| OpenAPI 3.2.1 → 3.2.1 | 8 → 4 | 1 → 1 | 358 → 306 | 12 → 12 |

Each input has one JSON API document, an integer `Base` component, twenty
`Use0` through `Use19` components referring to `#/components/schemas/Base`, and
no operations. The captured ID is `file:///captured/api.json`, generation is 4,
snapshot is `measurement`, and destination is `file:///measured/`. The cases run
in the table's order in one process. This measures source constructions and
explicit work, rather than elapsed time or native input behavior.

Counters were injected into copied committed TypeScript only: `createGraph`,
the `SourceDocument` constructor, the `MigrationSchemaOwners` constructor, and
`MigrationSemanticOrigins.inspect`. Production files were unchanged. The source
archive SHA-256 is `7f07e88904383399ed09299a3a4ba94336d014d2304b410fb6c3c550ef790e86`;
the immutable input set SHA-256 is
`0c762b5bf261d7a602581c4077073a370646e137cc48ae8219ec204483d92863`.
Detailed local input and count receipts are in
`build/diagnostics/simplification-20261113/conversion-owners/`.

The additional shared dynamic-resource fixture was blocked before these
changes and completes afterward. Its work counts are not a comparable
before/after performance result.

The source reductions behind these counts include one allocation authority per
genuine family stage; one captured entry/role allocation replacing repeated
preparation and superseded-copy retirement; common final reference emission;
removal of synthetic schema-shell repair; and retained parameter Examples using
the common owner instead of scanning every document node. Mixed modern families
lower in one Swagger object phase before copying their final aliases.
