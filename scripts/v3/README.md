# M1 migration preflight

These commands are intentionally independent of the application build and do not modify the legacy catalog, generator, schema, or package scripts:

```text
node scripts/v3/migration-tests.mjs
node scripts/v3/migration-preflight.mjs
```

`migration-tests.mjs` runs the raw-coordinate fixtures through the existing production Wiki normalizer and checks the M1 resolver contracts. It also runs `raw-validator.mjs`, a deliberately narrow independent parser that reads only the frozen wikitext for the release-critical identities and the Entrenched/Exo Contents sets. Production and independent results must agree.

`migration-preflight.mjs` reads the frozen raw snapshot, runs the scope and Contents reconciliation, checks every released Warbond item offer `(canonicalId, page, itemMedals)` against the formal catalog, validates typed corrections, and writes `reports/v3/migration-preflight.json`. It first compares every byte listed in `data/v3/config/source-manifest.json`; a byte mismatch is P0. Untracked or dirty source files are reported as reproducibility warnings, not silently treated as clean.

M1 source roles are intentionally asymmetric: `wiki-raw.json` is the raw Wiki fact snapshot; the official-localization registry is a sealed, correction-evidence-only derived snapshot with a locked byte hash and source-file hashes; `wiki-normalized.json`, the legacy catalog, and community aliases are diff-only references. The original strings exports are not in the repository and must be rehashed from the local game resources or a trusted sealed snapshot before release.

The current raw closure is 467 pages / 24 Warbond pages / 79 page sections / 545 template links / 545 template costs / 562 table rows / 1107 acquisition candidates. The current product-scope reference is 321 normalized equipment records, 292 released formal items, 6 upcoming records, and 23 out-of-product-scope records. These are audit facts, not a release-ready claim. The current legacy catalog snapshot has 0 null `pageUnlockMedals` and 0 `other` acquisition records; its obsolete `pageIncrementalMedals` field is tracked only as a non-v3 reference (118 missing among 167 Warbond items) and is not used as a v3 threshold.

`data/v3/config/localization-attestation.json` is a content-addressed proof for the official en-US/schinese strings used by the LAS correction. It records the game build/app manifest, FileDiver repository/release/executable hash, source file names/hashes, stable Keys/values, command parameters, and a canonical artifact hash excluding its own hash field. Preflight cross-checks it against the sealed localization registry and correction bindings; future game-build changes require a new attestation. Absolute temporary export paths and the original strings files are intentionally not stored.

The preflight report is a compact audit artifact. It stores input/page/candidate set hashes and all unresolved or ambiguous candidates, but not the full normal page/candidate lists; those are reconstructed from the raw snapshot by the same deterministic command. The gate status is derived from the current run and is split into `dataReady` and `reproducibleReady`. A clean data audit may still have `reproducibleReady: false` while inputs or the M1 tool bundle are untracked/dirty, or while the original game strings have not been re-attested. Only a committed clean checkout plus a fresh local-strings attestation may clear that state. This M1 preflight is an audit/migration gate, never the application's release-readiness gate; package/workflow integration remains a later step. `blocked` is the honest result whenever either state is not ready.
