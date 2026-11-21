# Ollie — Audit Follow-Up (OX-Alpha)

**Date:** 2026-08-22
**Author:** ox-alpha (independent second-pass review)
**Scope:** Full sweep of `src/`, `app/`, specs, test infrastructure; suite re-run (515/515 green at time of review).

> **Note (added 2026-08-31 by Cy4 audit):** `src/information-theory/steganography/jsteg.js`
> has been removed from the source tree. The jsteg references in §2 (JSDoc rot,
> dead exports, code duplication between `f5-syndrome.js` and `jsteg.js`) are
> moot for the current codebase — `f5-syndrome.js` is the sole steganographic
> extraction path. See `docs/audits/Cy4-Codebuddy-audit.md` finding Cy4-5.

---

## 0. Relationship to the Previous Audits (2026-08-20)

This report does **not** stand alone. Two prior reviews exist in the repository root, both dated
2026-08-20:

| Document | ID scheme | Character |
|---|---|---|
| `CODE_REVIEW.md` | `C1–C34` (bugs), `S1–S21` (style) | Static line-review, UI-heavy |
| `AUDIT_REPORT.md` | `S1–S12` (security), `Q1–Q11` (quality), `P1–P6` (perf/port), `A1–A6` (architecture/tests) | Threat-model-driven, empirically probed (`_probe_*.mjs`) |

There are also two **unpublished scratch sources**: `_agentA_report.md` / `_agentA_messages.txt`
(repo root) and `.jules/sentinel.md`, which contain informal observations that never made it into
either published report.

Every finding below carries an overlap tag so the three documents can be reconciled:

- **[OVERLAP: …]** — previously reported; independently re-confirmed here (with any new detail noted).
- **[EXTENDS: …]** — builds on a prior finding; adds a materially new failure mode or severity change.
- **[CONTRADICTS: …]** — disagrees with an explicit prior assessment; read carefully.
- **[NEW]** — not present in either published report (checked by keyword search of both documents;
  may appear in the unpublished scratch notes, which is called out where relevant).

### Overlap Matrix (summary)

| # | This report | CODE_REVIEW.md | AUDIT_REPORT.md | Status |
|---|---|---|---|---|
| C1 | Hardcoded PBKDF2 salt | C1 | S-6 | Full overlap |
| C2 | Password-as-LCG-seed / `'F5default'` stego key | S-item @L463 (dismissed as irrelevant) | S-11 (adjacent: seed truncation only) | **CONTRADICTS + EXTENDS** |
| C3 | `javascript:` URI via Launch button | C6 (noted in impact text) | — | EXTENDS (severity elevated) |
| C4 | `BatchExtractor` bare-`null` breaks tuple contract | C11 | Q-3 | Full overlap |
| C5 | Checksum decorative (never verified) | C15 | S-9 | Full overlap |
| C6 | Unvalidated ECC metadata → alloc/OOB | — (implied by C16) | S-1, S-2, S-3, S-5 | Full overlap |
| C7 | `decodeScan` bounds gap + duplicate component IDs | — | — (in `_agentA_*.txt` scratch only) | **NEW** (to published reports) |
| C8 | Progressive JPEG non-compliant both directions | — | — | **NEW** |
| C9 | `cryptoInstance` async race | C17 | — | Full overlap |
| C10 | `main.js` unawaited async `encode()` | S21 (adjacent: debug buster/no tests) | — | **NEW** |
| C11 | `save()` throws + destructive non-atomic disk writes | C18 (throw only) | — | EXTENDS (atomicity is new) |
| P1 cluster | Input mutation, silent field loss, DropZone truncation, modal double-escaping, KDF params | C26 (DropZone), C27 (import validation), C30 (`_getSessionKey`) | — | Mixed: see per-item tags |
| Style items | Conventions/JSDoc/dead code/console/etc. | S1–S12, C9/C23 | Q-1–Q-8 | Mostly full overlap |
| Idiomatic items | Perf churn, validation centralization, tooling | — | P-1, P-3 (churn), A-4 (test gaps) | Partial overlap |

Items the prior audits cover that this report deliberately does **not** repeat (already fully
documented, still open): EXIF/APP-segment stripping on the transcode path (AUDIT Q-10);
scanner-vs-embedder capacity divergence (AUDIT Q-11); `chunk.total` DoS (AUDIT S-4); mock metadata /
hardcoded filename (CODE_REVIEW C12, AUDIT Q-5); Blob-without-slice corruption (CODE_REVIEW C13);
Google Fonts dependency (CODE_REVIEW C8); stored-K tolerance warning (CODE_REVIEW C22).

---

## 1. Critical Bugs
*(Security & correctness defects that must be fixed before the "publish carriers to public hosts"
roadmap. Ordered by severity.)*

### C1. Hardcoded PBKDF2 salt — `'ollie-session-salt-1234'`
**[OVERLAP: CODE_REVIEW C1, AUDIT S-6]** — `src/structures/vault/immutable-vault.js:25,188`

The session/master key is derived with a constant salt baked into source. Identical passwords
produce identical AES keys in every vault worldwide; rainbow-table/precomputation attacks become
viable; cross-vault linkage of entry ciphertexts is trivial. This single line undermines the crypto
design. Fix as specified in AUDIT S-6: random per-vault salt recorded inside the encrypted payload's
vault metadata (GCM-covered), as a format-version bump. Note the outer container payload already
does this correctly (fresh salt per embed, `f5-syndrome.js:449-460`) — the inner vault layer is the
regression.

### C2. Raw password used as a ≤32-bit LCG seed for the F5 permutation
**[CONTRADICTS: CODE_REVIEW @L463-464] [EXTENDS: AUDIT S-11]** — `src/information-theory/steganography/f5-syndrome.js:33-62,524,539`

CODE_REVIEW explicitly dismisses permutation-key weakness as *"cryptographically irrelevant (the
permutation is keyed by the password and the payload is AES-encrypted)"*. That assessment is wrong
on two counts:

1. **The effective keyspace is ≤32 bits regardless of password strength.** `createPRNG` folds the
   entire password into a single 32-bit state driving a Java-Random-style LCG. Offline brute force
   over the permutation seed is ~2³² work — cheap — and yields a known-coefficient-ordering oracle
   that also functions as a fast password-confirmation side channel.
2. **With no password, the seed is the public constant `'F5default'`.** Anyone can regenerate the
   exact permutation, locate every embedded coefficient, and run steganalysis or targeted RS/ECC
   stripping without touching the AES layer.

AUDIT S-11 documented only the binary-seed *truncation* symptom and rated it LOW because production
uses string seeds — the string path is precisely where the entropy collapse lives. Fix: separate the
stego key from the encryption password entirely; derive the permutation seed from the derived key
(e.g., HKDF(masterKey, "stego-permutation")), and fail closed rather than falling back to a public
constant seed.

### C3. `javascript:` URI execution via the Launch button
**[EXTENDS: CODE_REVIEW C6 — scheme injection was one clause of the tabnabbing finding; elevated to standalone critical]** — `app/components/vault/components/vault-view.js:76-78`

`window.open(entry.url, '_blank')` with attacker-controlled URL content. HTML escaping (which the
view correctly applies) does nothing against scheme injection. A malicious import JSON
(`importData` performs no URL validation — CODE_REVIEW C27) or a tampered-but-decryptable carrier
yields `url: "javascript:…"` → arbitrary JS in the app origin, where the unlocked vault and master
password live in memory. Whitelist `http:`/`https:` before opening, pass `noopener,noreferrer`.
`test/security/xss.test.js` covers entity escaping only; extend it to scheme injection.

### C4. Contract-breaking bare `null` corrupts the Result-tuple protocol
**[OVERLAP: CODE_REVIEW C11, AUDIT Q-3]** — `src/information-theory/steganography/batch-extractor.js:113-117`

On reassembly failure the method returns bare `null`; `PasswordVault.load` destructures
`const [result, extractErr] = await extractor.extract(...)` → `TypeError: null is not iterable`,
turning a recoverable ECC failure into a crash. Re-affirmed as a must-fix; AUDIT A-1 correctly
identifies this as one of six surfaces needing a single standardization PR.

### C5. Integrity checksum is decorative
**[OVERLAP: CODE_REVIEW C15, AUDIT S-9]** — `src/information-theory/steganography/chunk-manager.js:30,43-82,99-105`

`calculateChecksum` is a naive additive sum (any byte permutation collides; signed-int32 leakage via
`& 0xFFFFFFFF`) — and `reassemble()` **never verifies it anyway**. A proper `crc32` already exists
in `src/utils/crc32.js`; SHA-256 (per AUDIT S-9's recommendation) is better since WebCrypto makes it
free. Either wire verification in or delete the field — dead security theater breeds false
confidence.

### C6. Attacker-controlled container metadata drives allocations with zero validation
**[OVERLAP: AUDIT S-1, S-2, S-3, S-5 — mechanism empirically proven there]** —
`src/information-theory/error-correction/rs-interleaver.js:107-158`, reached from
`jsteg.js:352-370` and `f5-syndrome.js:719-735`

`eccProfile` / `originalLength` / `blockCount` flow unchecked from parsed stego JSON into
`ErrorCorrection.recover`: GiB-scale allocations, OOB reads coerced to zero-fill, negative-length
`RangeError` in the legacy path. Given the public-host plan, every decoded image is unauthenticated
remote input. Adopt AUDIT's ordered-fix item 1 verbatim (validate profile ∈ `ECC_PROFILES`,
`originalLength ≤ blockCount × dataBytes`, `blockCount ≤ ceil(payload.length/255)`, bounds-check
`_deinterleave`, re-CRC after recovery).

### C7. Missing block-index bounds check → silent corruption on malformed carriers
**[NEW — appears only in unpublished scratch notes `_agentA_messages.txt`/`_agentA_recovery2.txt`, never promoted to a published finding]**

Three compounding defects:

1. `decodeScan` indexes `blocks[blockIndex]` unguarded (`src/codec/decoder.js:429-434`);
2. SOF parsing accepts duplicate component IDs, which silently overwrite each other in
   `initializeComponents` and desynchronize block counts (`src/automata/parsers/sof-automaton.js:57-81`);
3. When the index is out of range, `decodeBlock(block = null)` receives `undefined` and happily
   decodes into a **throwaway buffer** (`src/automata/entropy-coding/huffman-decoder-fsm.js:117-120`)
   — silent wrong output instead of an error.

Silent corruption is the worst failure mode for a vault carrier: the user gets a decodable-looking
image whose payload is quietly destroyed. Fail loudly at all three points. (Scratch notes also flag
that BitReader methods throw while the FSM layer returns tuples — same family, fix together.)

### C8. "Progressive" support doesn't exist on either side of the codec
**[NEW]** — `src/codec/encoder.js:98-105,674-690`; decoder ignores `Ah`/`Al` entirely

The encoder emits two spectral-selection scans with `Ah=Al=0` always — spectral selection without
successive approximation is not valid progressive JPEG, and strict decoders will reject or mangle
it. The decoder accepts SOF2 but implements no refinement passes, so real progressive files decode
incorrectly. The existing progressive tests only verify the encoder's own output round-trips through
its own decoder (self-consistent, non-compliant). README claims support. Per constitution rule #9:
ship it properly or cut the option and the README claim.

### C9. Crypto provider race condition
**[OVERLAP: CODE_REVIEW C17]** — `src/information-theory/cryptography/crypto-compat.js:12-19`

In Node, `cryptoInstance` stays `null` until the dynamic `import()` resolves; `ChunkManager.generateId()`
and `PasswordVault.generateId()` throw `TypeError` if invoked early. `getCrypto()` additionally
returns object-or-Promise depending on environment — an unusable type. Consolidate on the pattern
already used in `pbkdf2.js`/`aes-gcm.js`.

### C10. Async drift broke the `main.js` diagnostics button
**[NEW]** — `src/main.js:48`

`JpegEncoder.encode(...)` is now async but is called without `await`; subsequent code reads
`jpegBytes.length` off a Promise (`undefined`). Symptom of having no static type checking over
JSDoc (see I8). One-line fix, but it indicates other stale call sites may exist — grep for
non-awaited `encode(`/`decode(` across `app/`.

### C11. Destructive save with no atomicity
**[EXTENDS: CODE_REVIEW C18 — prior flagged only that `save()` throws instead of returning a tuple]** —
`app/components/vault/components/vault-ui.js:239-373` + `src/structures/vault/immutable-vault.js:153-168`

`saveVault()` has already begun overwriting original carrier images one-by-one when `save()` throws
mid-batch. A failure partway leaves the photo set half-mutated and the vault possibly unrecoverable
— and the overwritten images were the user's only backup medium. Buffer all outputs, verify all
encodes, then write; keep originals until the batch is confirmed complete.

### P1 cluster (fix soon)

| Item | Tag | Location |
|---|---|---|
| `addEntry` mutates its argument (`entry.id = …`) | **NEW** | `immutable-vault.js:40` |
| `updateEntry` silently discards non-array `tags`/`customFields` (data loss) | **NEW** | `immutable-vault.js:69-70` |
| DropZone reads only first `readEntries()` batch (>100 files/folder silently dropped) | OVERLAP: C26 | `drop-zone.js:100-104` |
| `ModalManager.confirm()` HTML-escapes messages callers author as HTML (`<br>`/`<b>` render literally) | **NEW** (related: CODE_REVIEW S1 escape duplication) | `modal-manager.js:95` vs `vault-ui.js:246,446` |
| PBKDF2 at 100k SHA-256 below OWASP (~600k), count unrecorded in format | OVERLAP: C2 / AUDIT S-7 | `pbkdf2.js:7,52` |
| Import accepts arbitrary entry IDs → duplicates possible | EXTENDS: C27 | `vault-ui.js:418` |
| Locked-vault `search()` still exposes titles/usernames/URLs; UI checks `!!masterPassword` while model uses `isUnlocked` | **NEW** (adjacent: C30 private-API call) | `vault-ui.js:496`, `immutable-vault.js:98-112` |

---

## 2. Style and Consistency

*(Mostly full overlap with the prior reports' style sections — restated for completeness with tags.)*

1. **Error-handling convention chaos** — **[OVERLAP: AUDIT A-1/Q-2/Q-3, CODE_REVIEW C9-C11,C18,C23,C32]**.
   Constitution rule #6 mandates Result tuples; reality mixes tuples, throws (`assembleImage`
   internals, `ReedSolomon*`, `vault.save`), bare `null`s, booleans, and sync `Error` returns that
   aren't tuples (`decoder.decodeScan:353-355`, `initializeComponents:296`). One PR, six surfaces,
   contract tests (AUDIT A-1's prescription — endorsed).
2. **JSDoc rot** — **[OVERLAP: CODE_REVIEW S2-S5]**. Stacked duplicate doc blocks (`jsteg.js:29-43`
   vs `152-167`; `dht-automaton.js:12-19`); `@returns` types contradict actual returns; nothing
   verifies the annotations (see I8).
3. **`console.log` as ambient telemetry** — **[OVERLAP: CODE_REVIEW S9, AUDIT Q-6]**. Library code
   logs extracted-secret sizes/metadata (`decoder.js:256-262`), per-MCU progress in hot loops
   (`encoder.js:227,286`), handle names (`vault-ui.js:302`). Noise, perf overhead, information
   leakage in shared environments. Introduce leveled logging; strip from production paths.
4. **Dead code** — **[OVERLAP: AUDIT Q-1/A-2]**. `payload-container.js` (entire file — and note the
   irony that the bounds-checked serializer is the unused one), `F5Reader`
   (`f5-syndrome.js:850-859`), `Jsteg.getCategory`, `BatchEmbedder.estimateCapacity`.
5. **Copy-paste divergence risk** — **[OVERLAP: CODE_REVIEW S12]**. Container serialize/parse
   duplicated between `f5-syndrome.js` and `jsteg.js` (~150 lines, already drifting: F5 stores `k`
   in-header, JSTG doesn't); `selectK` shrinkage math in 3 places; `escape()` ×2; `getCrypto()` ×3.
   Consolidate before the Rust port freezes behavior.
6. **Naming/readability** — **[PARTIAL OVERLAP: AUDIT Q-8 covers Java-port error strings]**. New
   here: `writeDHT(writeByte, writeWord, writeArray, id, type, tableObj)` takes `id` before `type`
   while internals branch on `type`, and variables named `dcCounts`/`dcValues` hold AC-table data
   (`encoder.js:632-672`). Also stale thinking-aloud comments shipped in production —
   **[OVERLAP: AUDIT Q-4]**, still present.
7. **Magic numbers** — **[PARTIAL OVERLAP: CODE_REVIEW S10]**. New instances: the undocumented
   1,000,000-block cap (`decoder.js:295`), `0.8` capacity safety factor (`batch-embedder.js:271`),
   invented `70`-byte ECC metadata-overhead estimate (`f5-syndrome.js:820`, `jsteg.js:499`),
   `Math.floor(capacity * 0.25)` heuristic (`batch-embedder.js:252`).
8. **Repo hygiene** — **[PARTIAL OVERLAP: AUDIT A-4 recommends promoting probes]**. Root littered
   with `_probe_*.mjs`, `_agentA_*` transcripts, 800KB `codebase_corpus.txt`, committed
   `test-output.txt`/`test-run-output.txt`; empty `description` in package.json;
   `devDependencies: { "node": "^22.x" }` antipattern (use `engines`); duplicate spec trees
   `src/specs/rules/` vs `src/specs/project rules/` (space-in-dirname edition); no CSP meta —
   **[OVERLAP: CODE_REVIEW C7]** — still open on a page rendering imported data.
9. **CapacityScanner documents a "Worker Pool" that isn't one** — concurrent promises on the main
   thread (`capacity-scanner.js:87-102`). Misleading doc; either implement real Workers (also fixes
   UI jank during embed/scan) or fix the comment. **[NEW]**

## 3. Idiomatic Improvements

1. **Centralize boundary validation** *(extends AUDIT's S-1 fix list)* — one `validateEntry`, one
   `validateContainerMetadata`, one `assertSafeUrl`, applied at trust boundaries (import, fromJSON,
   extraction). `SecureEntry.fromJSON` trusts storage blindly — **[OVERLAP: CODE_REVIEW C19/C20,
   AUDIT Q-9]**.
2. **Separate stego key from password** (see C2): `seed = HKDF(masterKey, "stego-permutation")`.
   **[NEW]**
3. **Version the KDF block** `{algo, iterations, salt}` in vault metadata so parameters ratchet up
   without breaking old vaults — **[OVERLAP: AUDIT S-6/S-7 prescribed fix; reiterated because the
   migration window closes at first publication]**.
4. **Stop threading `masterPassword` through every immutable clone** (`immutable-vault.js:46,81,95,200`)
   — ephemeral `UnlockContext` that `lock()` drops; today plaintext password persists on frozen
   objects for process lifetime, and `lock()` retains all ciphertext entries anyway. **[NEW]**
5. **Performance at scale** — **[OVERLAP: AUDIT P-1/P-3 measured the bits[] cost (10.3 B/bit steady)]**.
   Pack message bits into `Uint8Array` (`f5-syndrome.js:195-200`); growable typed arrays for
   `BitWriter.bytes` (`bit-writer.js:4`); subarrays instead of `slice()` copies in
   `parseFileStructure`; cache the permutation across the k-search (AUDIT P-2).
6. **Fail loudly on impossible decoder states** — bounds-check `blockIndex`; reject duplicate
   component IDs; make `decodeBlock` error on a missing target block instead of allocating a
   throwaway (see C7). **[NEW]**
7. **Single source of truth for lock state** — see P1 cluster. **[NEW]**
8. **Tooling debt** — ESLint (`no-console` in `src/`, unused-vars would have caught the dead code),
   `tsc --checkJs` for JSDoc verification (would have caught C10), format check, CI wiring. Cheap,
   high leverage, aligned with the Rust-port goal of a frozen spec. **[NEW]**
9. **Test hardening** — **[OVERLAP: AUDIT A-4 table]**, plus new gaps this review adds: scheme-
   injection URLs (C3), duplicate component IDs / out-of-range block indices (C7), interop decoding
   of *third-party* progressive files (C8 — current progressive tests only self-roundtrip),
   partial-batch save failures (C11), >100-entry directories (re-affirming C26).

## 4. Feature Ideas

1. **Shamir (M-of-N) secret sharing across carriers** — fits the multi-image shard model; any k of n
   photos restores the vault; tolerates lost/deleted public hosts. Natural fit with ChunkManager. *(NEW)*
2. **Signed carrier manifests** (Ed25519 over the chunk manifest) — tampering on public hosts becomes
   cryptographically detectable rather than CRC/ECC luck. Direct answer to the clear-web threat
   model. *(NEW)*
3. **Steganalysis-hardened embedding** — JSTG's 1→2/3 remapping and F5's decrement-only changes
   create detectable histogram artifacts; consider histogram-preserving mapping or wet-paper codes,
   plus a chi-square self-test so improvement is measurable. *(NEW)*
4. **Encrypted export** (plaintext export exists with good warnings; make encrypted export/import
   the default) + clipboard auto-clear timer. *(NEW)*
5. **TOTP generation** — `totp` is already a stored field; RFC 6238 turns storage into function. *(NEW)*
6. **Node CLI** (`ollie save/load/verify`) reusing core modules: scriptable backups, CI roundtrip
   verification, forces browser/Node parity the rules demand. *(NEW)*
7. **Rust-port groundwork** — publish wire-format spec (container layout v1, KDF params, ECC
   framing) + golden conformance vectors *now*. The dual F5/JSTG implementations show how formats
   drift; freeze v1 before Rust or you port the ambiguity. *(Reinforces AUDIT A-3/P-6.)*
8. **Vault compaction/stats UI** — per-carrier usage map, "add another photo" prompts at capacity
   thresholds (capacity is already computed — though note AUDIT Q-11's scanner/embedder divergence
   must be fixed for the numbers to mean anything). *(NEW, dependent on Q-11)*

---

## Recommended Execution Order

1. **C6** (metadata validation — preconditions for public hosts; AUDIT's ordered-fix item 1).
2. **C1 + KDF versioning** (format-version bump; closes the migration window issue).
3. **C2** (stego-key separation — requires the same format bump, do together with #2).
4. **C3** (scheme whitelist — small, high impact).
5. **C4/C5/C11** (contract standardization PR + checksum verification + atomic save).
6. **C7** (decoder fail-loud fixes + regression fixtures).
7. Convention/tooling sweep (Style §2.1, §2.3, I8) — everything after this gets cheaper.
8. **C8 decision point**: implement real progressive support or cut the feature and README claim.
9. Promote probes and new adversarial cases into `test/` per AUDIT A-4 + this report's additions.
