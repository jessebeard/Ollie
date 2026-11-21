# Test Coverage Expansion Roadmap

> Comprehensive audit of Ollie's multi-modal test spectrum, sorted by implementation
> difficulty from easiest to hardest. Covers Property-Based Testing (PBT), Metamorphic
> Testing (MT), and Fuzz Testing gaps across all source modules.
>
> Generated: 2026-09-03 | Source files: 50+ | Test files: 127 | PBT harness: test/utils/pbt.js

---

## Table of Contents

1. [Current State Assessment](#current-state-assessment)
2. [Critical Zero-Coverage Files](#critical-zero-coverage-files)
3. [Implementation Items (Easiest → Hardest)](#implementation-items)
4. [New File Manifest](#new-file-manifest)
5. [Generator Expansion Needs](#generator-expansion-needs)
6. [Success Metrics](#success-metrics)

---

## Current State Assessment

### Methodology Distribution

| Methodology          | File Count | Properties/Targets | Assessment              |
|----------------------|-----------:|-------------------:|-------------------------|
| Unit & Contract      |         85 |              ~800+ | Extensive — every module |
| Integration & E2E    |         20 |              ~120+ | Good — codec, vault, CLI |
| PBT (embedded)       |        ~25 |                ~40 | Moderate — clustered in algebraic/crypto/ECC |
| PBT (dedicated .pbt) |          3 |                ~12 | Sparse — only capacity-scanner, wire-format, test-runner |
| Metamorphic (MRs)    |          6 |                ~12 | Sparse — codec-mr strong, most subsystems zero |
| Fuzz Harnesses       |         10 |          9 suites  | Moderate — no QR, stego internals, CSV, utils |

### Subsystem Heat Map

| Subsystem                   | Unit | Integration | PBT | MT  | Fuzz |
|-----------------------------|:----:|:-----------:|:---:|:---:|:----:|
| Algebraic: Colorspace       |  ✅  |      ✅      | ✅  |  ⚠️  |  ❌  |
| Algebraic: DCT              |  ✅  |      ✅      | ✅  |  ✅  |  ❌  |
| Algebraic: Mappings         |  ✅  |      ✅      | ⚠️  |  ❌  |  ❌  |
| Algebraic: Quantization     |  ✅  |      ✅      | ⚠️  |  ❌  |  ❌  |
| Automata: BitStreams         |  ⚠️  |      —      | ❌  |  ❌  |  ✅  |
| Automata: Entropy Coding    |  ✅  |      —      | ⚠️  |  ❌  |  ❌  |
| Automata: Parsers           |  ✅  |      —      | ❌  |  ❌  |  ✅  |
| Codec: Encoder/Decoder      |  ✅  |      ✅      | ✅  |  ✅  |  ✅  |
| Codec: Transcoder           |  ✅  |      ✅      | ✅  |  ✅  |  —  |
| Codec: QR                   |  ✅  |      —      | ⚠️  |  ⚠️  |  ❌  |
| Crypto: AES/HMAC/PBKDF2     |  ✅  |      —      | ✅  |  ✅  |  ✅  |
| Crypto: KDF Chain           |  ✅  |      —      | ❌  |  ❌  |  ❌  |
| Crypto: TOTP                |  ✅  |      ✅      | ❌  |  ❌  |  ❌  |
| ECC: GF(256) / RS           |  ✅  |      ✅      | ✅  |  —  |  ✅  |
| Secret Sharing              |  ✅  |      ✅      | ✅  |  ✅  |  ✅  |
| Stego: STC/Engine           |  ✅  |      ✅      | ⚠️  |  ❌  |  ❌  |
| Stego: J-UNIWARD            |  ✅  |      —      | ❌  |  ❌  |  ❌  |
| Stego: Manifest             |  ✅  |      —      | ❌  |  ❌  |  ❌  |
| Vault: Structure            |  ✅  |      ✅      | ✅  |  ✅  |  ✅  |
| Vault: CSV Import           |  ✅  |      ✅      | ❌  |  ❌  |  ❌  |
| Utils: Base32/Encoding      |  ✅  |      —      | ⚠️  |  ❌  |  ❌  |
| Utils: Compression          |  ❌  |      —      | ❌  |  ❌  |  ❌  |
| Utils: CRC32                |  ❌  |      —      | ❌  |  ❌  |  ❌  |
| Utils: CSV Parser           |  ✅  |      —      | ❌  |  ❌  |  ❌  |

**Legend**: ✅ covered | ⚠️ partial | ❌ missing | — not applicable

---

## Critical Zero-Coverage Files

These source files have **no dedicated test file**. Any mutation is invisible to the suite.

| Source File                                          | Risk       | Impact |
|------------------------------------------------------|------------|--------|
| `src/automata/bit-streams/bit-writer.js`             | **CRITICAL** | Bit packing, buffer growth, 0xFF stuffing. Only exercised transitively via Huffman encoder. |
| `src/automata/entropy-coding/huffman-optimized-fsm.js` | **CRITICAL** | 16-bit lookup table decoder. Zero test references. |
| `src/codec/file-scanner.js`                          | **HIGH**   | File System Access API directory scanning. Zero test references. |
| `src/utils/compression.js`                           | **HIGH**   | Deflate/Inflate wrappers used by opaque container. |
| `src/utils/crc32.js`                                 | **MEDIUM** | IEEE CRC-32 used by chunk integrity. Only tested transitively. |
| `src/utils/logger.js`                                | **LOW**    | Leveled logger. |

---

## Implementation Items

Sorted from easiest to hardest. Each item includes effort estimate, prerequisites,
the exact files to create or modify, and the properties/relations/targets to implement.

### Difficulty Scale

- **Trivial** (T): < 30 min. Pure function, obvious invariant, existing generator suffices.
- **Easy** (E): 30 min – 2 hrs. Simple roundtrip or algebraic property, may need one new generator.
- **Moderate** (M): 2 – 5 hrs. Multi-step pipeline, new fuzz harness scaffold, or differential testing.
- **Hard** (H): 5 – 12 hrs. Complex state machines, async pipelines, worker isolation, or domain-specific generators.
- **Complex** (C): 12+ hrs. New test suite architecture, infrastructure changes, or multi-file harnesses.

---

### T-01 · CRC32 Standalone Tests
**Difficulty: Trivial** | **Type: Unit + PBT** | **New file**

- **Create**: `test/utils/crc32.test.js`
- **Register in**: `test/runner.js` + `app/test.html`
- **Source**: `src/utils/crc32.js`

| # | Test | Type |
|---|------|------|
| 1 | IEEE standard check value: `crc32("123456789") === 0xCBF43926` | Unit |
| 2 | Empty input produces consistent CRC | Unit |
| 3 | Single-bit flip in input always changes CRC (`Arbitrary.byteArray`) | PBT |
| 4 | Determinism: `crc32(data) === crc32(data)` for arbitrary data | PBT |
| 5 | Non-zero-length input never produces `0x00000000` trivially (sanity) | PBT |

**Why trivial**: Pure function, no async, no state, existing `Arbitrary.byteArray` generator works directly.

---

### T-02 · Compression Roundtrip PBT
**Difficulty: Trivial** | **Type: PBT** | **New file**

- **Create**: `test/utils/compression.test.js`
- **Register in**: `test/runner.js` + `app/test.html`
- **Source**: `src/utils/compression.js`

| # | Property | Generator |
|---|----------|-----------|
| 1 | `inflate(deflate(data)) ≡ data` for arbitrary byte arrays | `Arbitrary.byteArray(0, 4096)` |
| 2 | Empty input deflates and inflates to empty output | Fixed |
| 3 | Deflated size is finite and ≥ 0 | `Arbitrary.byteArray` |

**Why trivial**: Two-function module. Property is the textbook roundtrip. Functions are async
so tests need `await`, but no complex setup.

---

### T-03 · Encoding (Base64/UTF-8) Roundtrip PBT
**Difficulty: Trivial** | **Type: PBT** | **Add to existing file**

- **Modify**: `test/utils/encoding.test.js`
- **Source**: `src/utils/encoding.js`

| # | Property | Generator |
|---|----------|-----------|
| 1 | `base64Decode(base64Encode(bytes)) ≡ bytes` | `Arbitrary.byteArray(0, 2048)` |
| 2 | `utf8Decode(utf8Encode(string)) ≡ string` (for valid strings) | `Arbitrary.string(0, 500)` |
| 3 | Base64 output contains only `[A-Za-z0-9+/=]` characters | `Arbitrary.byteArray` |

**Why trivial**: Pure codec functions, existing generators, obvious roundtrip properties.

---

### T-04 · GF(256) Quantization Zero-Preservation PBT
**Difficulty: Trivial** | **Type: PBT** | **Add to existing file**

- **Modify**: `test/algebraic/quantization/inverse-quantization.test.js`
- **Source**: `src/algebraic/quantization/inverse-quantization.js`

| # | Property | Generator |
|---|----------|-----------|
| 1 | `dequantize(zero_block, any_table) ≡ zero_block` | `Arbitrary.byteArray(64, 64)` for table |
| 2 | `dequantize(quantize(block, table), table) ≈ block` within ±table[i]/2 | `Arbitrary.byteArray(64, 64)` |
| 3 | Sign preservation: `sign(dequantize(x)) === sign(x)` for each coefficient | `Arbitrary.integer(-2048, 2047)` |

**Why trivial**: Pure math, existing generators, the forward-quantization file already has a
similar PBT section to follow as a template.

---

### T-05 · URL Safety PBT
**Difficulty: Trivial** | **Type: PBT** | **Add to existing file**

- **Modify**: `test/security/url-safety.test.js`
- **Source**: `src/utils/url-safety.js`

| # | Property | Generator |
|---|----------|-----------|
| 1 | `javascript:` scheme always rejected regardless of casing or whitespace | `Arbitrary.string` prefix + `javascript:` |
| 2 | `data:` scheme always rejected | Fixed |
| 3 | `https://` scheme always accepted | `Arbitrary.string` for domain |
| 4 | Empty/null/undefined input never throws, returns boolean | Fixed |

**Why trivial**: Single predicate function, no state, existing generators.

---

### T-06 · Escape HTML Idempotence PBT
**Difficulty: Trivial** | **Type: PBT + MR** | **Add to existing file**

- **Modify**: `test/security/ui-legacy-xss.test.js`
- **Source**: `src/utils/escape-html.js`

| # | Relation | Type |
|---|----------|------|
| 1 | `escapeHtml(escaped)` output contains no raw `<`, `>`, `&`, `"`, `'` | PBT |
| 2 | **MR: double-escape stability** — `escapeHtml(escapeHtml(s))` produces a string that renders identically to `escapeHtml(s)` when interpreted by a browser (no double-encoding collapse) | MT |

**Why trivial**: Pure string function, existing `Arbitrary.string` generator is adversarial.

---

### E-01 · Block Assembly PBT
**Difficulty: Easy** | **Type: PBT** | **Add to existing file**

- **Modify**: `test/algebraic/mappings/block-assembly.test.js`
- **Source**: `src/algebraic/mappings/block-assembly.js`

| # | Property | Generator |
|---|----------|-----------|
| 1 | Assembled dimensions ≥ input dimensions and ≡ 0 (mod 8) | `Arbitrary.integer(1, 256)` for w, h |
| 2 | Total pixel count = width × height | Same |
| 3 | Non-multiple-of-8 dimensions pad without data loss | `Arbitrary.integer(1, 64)` |

**Needs**: May need a simple `Arbitrary.pixelBlock(w, h)` helper — a function returning
`new Uint8Array(w * h * 4)` filled with random bytes. This is ~5 lines.

---

### E-02 · Upsampling PBT + Metamorphic Relation
**Difficulty: Easy** | **Type: PBT + MT** | **Add to existing file**

- **Modify**: `test/algebraic/mappings/upsampling.test.js`
- **Source**: `src/algebraic/mappings/upsampling.js`

| # | Property / MR | Type |
|---|---------------|------|
| 1 | Uniform chroma plane upsamples to uniform output | PBT |
| 2 | Output dimensions = 2× input dimensions | PBT |
| 3 | **MR**: `upsample(downsample(plane))` has bounded error vs original | MT |

---

### E-03 · CSV Parser Fuzzing PBT
**Difficulty: Easy** | **Type: PBT** | **Add to existing file**

- **Modify**: `test/utils/csv.test.js`
- **Source**: `src/utils/csv.js`

| # | Property | Generator |
|---|----------|-----------|
| 1 | Parser never throws on arbitrary string input; always returns array or typed error | `Arbitrary.string(0, 2000)` |
| 2 | Parser never hangs (implicit via test timeout — see infrastructure item) | `Arbitrary.string` |
| 3 | Well-formed CSV with N rows always produces N parsed records | Custom CSV generator |

---

### E-04 · Base32 Roundtrip PBT Enhancement
**Difficulty: Easy** | **Type: PBT** | **Add to existing file**

- **Modify**: `test/utils/base32.test.js`
- **Source**: `src/utils/base32.js`

| # | Property | Generator |
|---|----------|-----------|
| 1 | `decode(encode(bytes)) ≡ bytes` (already exists — increase iterations to 500) | `Arbitrary.byteArray` |
| 2 | Encoded output contains only `[A-Z2-7=]` characters | `Arbitrary.byteArray` |
| 3 | Non-Base32 characters in input cause typed error, never silent corruption | `Arbitrary.string` |

---

### E-05 · KDF Chain Domain Separation MR
**Difficulty: Easy** | **Type: MT** | **Add to existing file**

- **Modify**: `test/information-theory/cryptography/kdf-chain.test.js`
- **Source**: `src/information-theory/cryptography/kdf-chain.js`

| # | Metamorphic Relation |
|---|----------------------|
| 1 | HKDF-Expand with info=`"aes-key"` ≠ info=`"stc-seed"` ≠ info=`"sca-cost"` for same IKM |
| 2 | Different salts yield different derived keys for same password |
| 3 | Same password + same salt + same info → deterministic output |

**Why easy**: The module already has fixed-vector tests. Adding MRs is just calling the
function with systematically varied parameters and asserting inequality/equality.

---

### E-06 · TOTP Clock Boundary MRs
**Difficulty: Easy** | **Type: MT + PBT** | **Add to existing file**

- **Modify**: `test/security/totp.test.js`
- **Source**: `src/information-theory/cryptography/totp.js`

| # | Property / MR |
|---|---------------|
| 1 | **MR: Clock monotonicity** — adjacent 30-second windows produce distinct codes |
| 2 | **MR: Drift symmetry** — `verify(code, t)` succeeds iff `t ∈ [t_code − drift, t_code + drift]` |
| 3 | **PBT**: Random timestamps always produce 6-digit numeric strings | `Arbitrary.positiveInteger(2_000_000_000)` |
| 4 | **PBT**: `codeFromOtpauthUri(uri)` never throws on well-formed URIs | Custom URI generator |

---

### E-07 · QR Encoder Metamorphic Relations
**Difficulty: Easy** | **Type: MT** | **Add to existing file**

- **Modify**: `test/security/qr-encoder.test.js`
- **Source**: `src/codec/qr-encoder.js`

| # | MR ID | Metamorphic Relation |
|---|-------|----------------------|
| 1 | MR-qr-1 | Version monotonicity: longer payloads require ≥ version number |
| 2 | MR-qr-2 | Dimension formula: module count = 4×version + 17 |
| 3 | MR-qr-3 | All 8 mask patterns produce decodable output |
| 4 | MR-qr-4 | Same data + same mask = same penalty score |

---

### E-08 · QR Capacity Version Monotonicity PBT
**Difficulty: Easy** | **Type: PBT** | **Add to existing file**

- **Modify**: `test/security/qr-capacity.test.js`
- **Source**: `src/codec/qr-capacity.js`

| # | Property |
|---|----------|
| 1 | For every ECC level, capacity is strictly monotonically increasing with version |
| 2 | `selectVersion(payload)` returns the minimal version that fits |
| 3 | All capacity table entries are positive integers |

---

### E-09 · Carrier Manifest Tamper MR
**Difficulty: Easy** | **Type: MT + PBT** | **New section in existing file**

- **Modify**: `test/security/carrier-manifest.test.js`
- **Source**: `src/information-theory/steganography/carrier-manifest.js`

| # | Property / MR |
|---|---------------|
| 1 | **MR**: Flipping any single bit in a stamped manifest causes verify to return false |
| 2 | **PBT**: `verify(create(records, key), key) === true` for arbitrary record structures |
| 3 | **PBT**: `verify(manifest, wrong_key) === false` for key ≠ original key |

---

### E-10 · Huffman Decoder FSM PBT
**Difficulty: Easy** | **Type: PBT** | **Add to existing file**

- **Modify**: `test/automata/entropy-coding/huffman-decoder-fsm.test.js`
- **Source**: `src/automata/entropy-coding/huffman-decoder-fsm.js`

| # | Property |
|---|----------|
| 1 | DC differential accumulation: after N blocks, reconstructed DC = Σ(differentials) |
| 2 | AC run-length conservation: total positions filled = 64 for every decoded block |
| 3 | Decoder FSM never enters undefined state for any valid Huffman code prefix |

---

### M-01 · Compression + CRC32 Roundtrip Integration PBT
**Difficulty: Moderate** | **Type: PBT** | **Add to existing file**

After T-01 and T-02 are done, add a combined property:

- **Modify**: `test/utils/compression.test.js`

| # | Property |
|---|----------|
| 1 | `crc32(inflate(deflate(data))) === crc32(data)` — CRC integrity survives compression roundtrip |
| 2 | Truncated compressed stream → `inflate` returns typed error, never silent partial data |

---

### M-02 · BitWriter Unit + PBT + Differential Tests
**Difficulty: Moderate** | **Type: Unit + PBT + Differential** | **New file**

- **Create**: `test/automata/bit-streams/bit-writer.test.js`
- **Register in**: `test/runner.js` + `app/test.html`
- **Source**: `src/automata/bit-streams/bit-writer.js`

| # | Test | Type |
|---|------|------|
| 1 | Write 1–8 bits and verify byte output matches hand-computed values | Unit |
| 2 | Dynamic buffer growth triggers correctly at capacity boundary | Unit |
| 3 | `0xFF` byte stuffing: writing `0xFF` byte emits `0xFF 0x00` | Unit |
| 4 | **Roundtrip bijection**: `BitReader(BitWriter(bits)) ≡ bits` for arbitrary bit sequences | PBT |
| 5 | **Length conservation**: total bits written = sum of all `writeBits` call widths | PBT |
| 6 | Random interleaving of `writeBit()`, `writeBits(n)`, `writeByte()` — no crash, consistent state | Fuzz |

**Why moderate**: Requires understanding the `BitWriter` API, buffer growth semantics, and
constructing a differential test pairing with `BitReader`. May need a new
`Arbitrary.bitSequence()` generator.

---

### M-03 · Huffman Optimized FSM Differential Tests
**Difficulty: Moderate** | **Type: Differential + PBT** | **New file**

- **Create**: `test/automata/entropy-coding/huffman-optimized-fsm.test.js`
- **Register in**: `test/runner.js` + `app/test.html`
- **Source**: `src/automata/entropy-coding/huffman-optimized-fsm.js`

| # | Test | Type |
|---|------|------|
| 1 | For every valid Huffman code, `optimizedDecode(stream) ≡ standardDecode(stream)` | Differential |
| 2 | Lookup table covers all 65,536 16-bit prefixes without holes | PBT |
| 3 | Random bitstreams: optimized decoder never crashes, always returns typed error or valid symbol | Fuzz |

**Why moderate**: Requires constructing valid DHT tables, feeding them through both decoder
paths, and comparing symbol-by-symbol output. The lookup table verification needs iterating
all 2^16 entries.

---

### M-04 · Parser Automaton PBT Properties
**Difficulty: Moderate** | **Type: PBT** | **Add to existing files**

Add PBT sections to each parser test file:

| Parser File | Properties |
|-------------|------------|
| `test/automata/parsers/dht-automaton.test.js` | Huffman tree well-formedness: no code > 16 bits, total codes ≤ 256, prefix-free |
| `test/automata/parsers/dqt-automaton.test.js` | All table entries ∈ [1, 255] for 8-bit precision |
| `test/automata/parsers/sof-automaton.test.js` | Duplicate component IDs always rejected |
| `test/automata/parsers/sos-automaton.test.js` | Component count matches SOF declaration |

**Why moderate**: Need to construct valid-but-randomized JPEG segment byte sequences. May
need a segment-builder helper function.

---

### M-05 · STC Matrix Roundtrip Fuzz
**Difficulty: Moderate** | **Type: Fuzz** | **New file**

- **Create**: `test/fuzz/stego-fuzz.mjs` + `test/fuzz/stego-fuzz.test.js`
- **Register in**: `test/fuzz/suites.mjs` as suite `stego`, `test/runner.js` + `app/test.html`
- **Source**: `src/information-theory/steganography/stc-matrix.js`, `opaque-container.js`, `stego-engine.js`

| # | Target | Approach |
|---|--------|----------|
| 1 | STC matrix | Random cover coefficients + random messages + random seeds → `extract(embed(cover, msg)) ≡ msg` |
| 2 | Opaque container | Random payloads including 0-byte and max-capacity → `unseal(seal(payload)) ≡ payload`, bucket ∈ [256B, 128KB] |
| 3 | Stego engine | Random covers × payloads × passwords → roundtrip or clean capacity error |
| 4 | Encrypted container | Corrupt sealed envelopes: truncate, flip bits → always typed error, never silent decrypt |

---

### M-06 · Steganography Metamorphic Relations
**Difficulty: Moderate** | **Type: MT** | **New file**

- **Create**: `test/fuzz/steganography-mr.mjs` + `test/fuzz/steganography-mr.test.js`
- **Register in**: `test/fuzz/suites.mjs` as suite `stego-mr`, `test/runner.js` + `app/test.html`
- **Source**: `src/information-theory/steganography/stego-engine.js`, `carrier-manifest.js`

| MR ID | Metamorphic Relation | Module |
|-------|----------------------|--------|
| MR-stego-1 | Embedding determinism: `embed(cover, msg, key)` × 2 → identical modifications | stego-engine.js |
| MR-stego-2 | Capacity monotonicity: larger covers ≥ capacity of smaller ones | stego-engine.js |
| MR-stego-3 | Key isolation: `extract(cover, key₁) ≠ extract(cover, key₂)` for key₁ ≠ key₂ | stego-engine.js |
| MR-stego-4 | Manifest HMAC tamper: any bit flip in stamped manifest → verify fails | carrier-manifest.js |

---

### M-07 · CSV Import Fuzz Harness
**Difficulty: Moderate** | **Type: Fuzz** | **New file**

- **Create**: `test/fuzz/csv-fuzz.mjs` + `test/fuzz/csv-fuzz.test.js`
- **Register in**: `test/fuzz/suites.mjs` as suite `csv`, `test/runner.js` + `app/test.html`
- **Source**: `src/utils/csv.js`, `src/structures/vault/csv-import.js`

| # | Target | Approach |
|---|--------|----------|
| 1 | CSV parser | Unmatched quotes, embedded newlines, NUL bytes, BOM markers, mixed line endings → typed result, never hangs |
| 2 | CSV import | Random CSV with vendor headers (Chrome, Firefox, KeePass, Bitwarden) → valid entries or typed error, never drops rows silently |

---

### M-08 · Utils Fuzz Harness
**Difficulty: Moderate** | **Type: Fuzz** | **New file**

- **Create**: `test/fuzz/utils-fuzz.mjs` + `test/fuzz/utils-fuzz.test.js`
- **Register in**: `test/fuzz/suites.mjs` as suite `utils`, `test/runner.js` + `app/test.html`
- **Source**: `src/utils/base32.js`, `src/utils/encoding.js`, `src/utils/url-safety.js`, `src/utils/escape-html.js`

| # | Target | Approach |
|---|--------|----------|
| 1 | Base32 | Roundtrip + hostile non-Base32 strings |
| 2 | Encoding | Roundtrip + lone surrogates, overlong encodings, null bytes |
| 3 | URL safety | Random protocol schemes (`javascript:`, `data:`, `vbscript:`, mixed case, Unicode homoglyphs) |
| 4 | Escape HTML | Double-escape stability, no raw `<>&"'` in output |

---

### M-09 · QR Fuzz Harness
**Difficulty: Moderate** | **Type: Fuzz** | **New file**

- **Create**: `test/fuzz/qr-fuzz.mjs` + `test/fuzz/qr-fuzz.test.js`
- **Register in**: `test/fuzz/suites.mjs` as suite `qr`, `test/runner.js` + `app/test.html`
- **Source**: `src/codec/qr-encoder.js`, `src/codec/qr-decoder.js`

| # | Target | Approach |
|---|--------|----------|
| 1 | QR encoder | Random byte payloads → output dimensions match version formula, finder patterns at correct positions |
| 2 | QR decoder | Mutate valid QR bitmaps: random bit flips, noise rows, corrupt format info → correct decode or typed error, never silent corruption |
| 3 | QR binarizer | Gradient images, noisy thresholds, inverted polarity → consistent binarization or graceful failure |

---

### H-01 · J-UNIWARD Metamorphic Relations
**Difficulty: Hard** | **Type: MT** | **New file**

- **Create**: `test/fuzz/juniward-mr.mjs` + `test/fuzz/juniward-mr.test.js`
- **Register in**: `test/fuzz/suites.mjs` as suite `juniward`, `test/runner.js` + `app/test.html`
- **Source**: `src/information-theory/steganography/juniward.js`

| MR ID | Metamorphic Relation |
|-------|----------------------|
| MR-jw-1 | Cost positivity: distortion cost > 0 for all non-zero coefficient changes |
| MR-jw-2 | Sign-flip symmetry: cost(+Δ) = cost(−Δ) for symmetric AC modifications |
| MR-jw-3 | Frequency sensitivity monotonicity: low-frequency changes have higher cost than high-frequency |
| MR-jw-4 | Anti-SCA key independence: distortion map under key₁ ≠ distortion map under key₂ |

**Why hard**: Requires constructing valid 8×8 DCT coefficient blocks, running the full
wavelet decomposition pipeline, and understanding the J-UNIWARD perceptual model deeply
enough to assert on cost ordering. Needs a new `Arbitrary.dctBlock()` generator.

---

### H-02 · Dedicated `test/pbt/` Suite (10 files)
**Difficulty: Hard** | **Type: PBT** | **New directory**

Create a focused property-test suite at higher iteration counts (500 per property):

```
test/pbt/
├── algebraic.pbt.js        # Colorspace roundtrip, DCT/IDCT, block/zigzag bijections, quantization
├── automata.pbt.js          # BitWriter↔BitReader bijection, Huffman FSM completeness
├── codec.pbt.js             # Encoder/decoder dimension/fidelity, transcoder integrity
├── crypto.pbt.js            # KDF domain separation, TOTP clock, AES-GCM roundtrip
├── ecc.pbt.js               # GF(256) field axioms, RS correction bounds, Cauchy subset
├── secret-sharing.pbt.js    # Shamir/CSS roundtrip, threshold boundaries
├── steganography.pbt.js     # STC embed/extract, opaque container, stego engine roundtrip
├── qr.pbt.js                # QR encode/decode roundtrip, version monotonicity
├── vault.pbt.js             # Vault CRUD roundtrip, rotation, export/import identity
└── utils.pbt.js             # Base32, CRC32, CSV, compression, encoding roundtrips
```

**Design principles**:
- Pure properties only — no setup fixtures, no mocks
- 500 iterations default (5× current 100)
- Every generator bounded per Rule 13 (algorithm capacity limits)
- Every assertion on content/structure per Rule 12 (mutation-killing)
- Each file registered in both `test/runner.js` and `app/test.html`

**Why hard**: Aggregating ~80+ properties across 10 files requires understanding every
module's contract deeply. Many properties need domain-specific generators not yet in `pbt.js`.

**Migration note**: Existing PBT tests in `.test.js` files stay put — they serve as inline
documentation. The `test/pbt/` suite is a **superset** with higher iteration counts.

---

### H-03 · `Arbitrary` Generator Library Expansion
**Difficulty: Hard** | **Type: Infrastructure** | **Modify existing file**

- **Modify**: `test/utils/pbt.js`

| Generator | Signature | Purpose | Shrink Strategy |
|-----------|-----------|---------|-----------------|
| `uint8Array(exactLength)` | `(n: number)` | Fixed-length byte arrays (8×8 DCT, AES keys) | Zero-fill |
| `dctBlock()` | `() → Int16Array(64)` | Values in [-2048, 2047] per JPEG spec | Halve magnitudes toward 0 |
| `pixelBlock(w, h)` | `(w, h) → Uint8Array(w*h*4)` | RGBA pixel data | Truncate dimensions, zero-fill |
| `oneOf(...values)` | `(...T[]) → T` | Uniform selection from fixed set | Remove last option |
| `record({k: gen})` | `(spec) → Object` | Composite records with per-field shrinking | Shrink each field independently |
| `frequency([[w, gen]])` | `(pairs) → T` | Weighted generator selection | Use highest-weight generator |
| `suchthat(gen, pred)` | `(gen, fn) → gen` | Filtered generator (rejection sampling, max 100 attempts) | Delegate to inner gen |
| `bitSequence(minBits, maxBits)` | `(min, max) → {bits: number[], length: number}` | Arbitrary bit sequences for BitWriter tests | Truncate |

**Why hard**: Each generator needs a proper `{ generate, shrink }` contract. The shrink
strategies must be semantically meaningful (not just truncation). `suchthat` needs a
rejection limit to avoid infinite loops. `record` needs recursive per-field shrinking.

---

### H-04 · Per-Test Execution Timeouts
**Difficulty: Hard** | **Type: Infrastructure** | **Modify existing file**

- **Modify**: `test/utils/test-runner.js`

Add a per-test timeout mechanism:

```
it('name', fn, { timeout: 5000 })   // default 10s, overridable
```

Implementation: wrap `await fn()` in `Promise.race([fn(), timeoutPromise])`. On timeout,
mark test as failed with `TIMEOUT` status rather than hanging the entire suite.

**Why hard**: The test runner has no lifecycle hook infrastructure. Adding timeouts requires
modifying the core `runTest` function, handling cleanup of timed-out async operations,
and ensuring the timeout mechanism works identically in both Node.js and browser environments.
Must not interfere with PBT's internal iteration loops.

---

### C-01 · Fuzz Suite Tagging & Filtering
**Difficulty: Complex** | **Type: Infrastructure** | **Modify existing files**

- **Modify**: `test/fuzz/suites.mjs`, `scripts/fuzz.mjs`

Extend the fuzz registry with metadata:

```js
{ name: 'stego', fn: stegoFuzz, tags: ['mt', 'roundtrip'], scale: 'heavy' }
```

Add CLI filtering: `--only=mt` runs all metamorphic suites, `--scale=smoke` for CI.

**Why complex**: Requires extending the suite schema, updating the CLI parser, adding
tag-based filtering logic, and updating all existing suite registrations. The `--scale`
parameter needs to map to per-suite iteration multipliers.

---

## New File Manifest

| # | File Path | Type | Phase | Difficulty | Status |
|---|-----------|------|:-----:|:----------:|:------:|
| 1 | `test/utils/crc32.test.js` | Unit + PBT | T-01 | Trivial | ✅ Done |
| 2 | `test/utils/compression.test.js` | PBT | T-02 | Trivial | ✅ Done |
| 3 | `test/automata/bit-streams/bit-writer.test.js` | Unit + PBT + Diff | M-02 | Moderate | ✅ Done |
| 4 | `test/automata/entropy-coding/huffman-optimized-fsm.test.js` | Differential + PBT | M-03 | Moderate | ✅ Done |
| 5 | `test/fuzz/stego-fuzz.mjs` | Fuzz harness | M-05 | Moderate | ✅ Done |
| 6 | `test/fuzz/stego-fuzz.test.js` | Smoke wrapper | M-05 | Moderate | ✅ Done |
| 7 | `test/fuzz/steganography-mr.mjs` | MR harness | M-06 | Moderate | ✅ Done |
| 8 | `test/fuzz/steganography-mr.test.js` | Smoke wrapper | M-06 | Moderate | ✅ Done |
| 9 | `test/fuzz/csv-fuzz.mjs` | Fuzz harness | M-07 | Moderate | ✅ Done |
| 10 | `test/fuzz/csv-fuzz.test.js` | Smoke wrapper | M-07 | Moderate | ✅ Done |
| 11 | `test/fuzz/utils-fuzz.mjs` | Fuzz harness | M-08 | Moderate | ✅ Done |
| 12 | `test/fuzz/utils-fuzz.test.js` | Smoke wrapper | M-08 | Moderate | ✅ Done |
| 13 | `test/fuzz/qr-fuzz.mjs` | Fuzz harness | M-09 | Moderate | ✅ Done |
| 14 | `test/fuzz/qr-fuzz.test.js` | Smoke wrapper | M-09 | Moderate | ✅ Done |
| 15 | `test/fuzz/juniward-mr.mjs` | MR harness | H-01 | Hard | ✅ Done |
| 16 | `test/fuzz/juniward-mr.test.js` | Smoke wrapper | H-01 | Hard | ✅ Done |
| 17 | `test/pbt/algebraic.pbt.js` | PBT suite | H-02 | Hard | ✅ Done |
| 18 | `test/pbt/automata.pbt.js` | PBT suite | H-02 | Hard | ✅ Done |
| 19 | `test/pbt/codec.pbt.js` | PBT suite | H-02 | Hard | ✅ Done |
| 20 | `test/pbt/crypto.pbt.js` | PBT suite | H-02 | Hard | ✅ Done |
| 21 | `test/pbt/ecc.pbt.js` | PBT suite | H-02 | Hard | ✅ Done |
| 22 | `test/pbt/secret-sharing.pbt.js` | PBT suite | H-02 | Hard | ✅ Done |
| 23 | `test/pbt/steganography.pbt.js` | PBT suite | H-02 | Hard | ✅ Done |
| 24 | `test/pbt/qr.pbt.js` | PBT suite | H-02 | Hard | ✅ Done |
| 25 | `test/pbt/vault.pbt.js` | PBT suite | H-02 | Hard | ✅ Done |
| 26 | `test/pbt/utils.pbt.js` | PBT suite | H-02 | Hard | ✅ Done |

**Total: 26 new files**

All files with `.test.js` or `.pbt.js` extensions must be registered in both
`test/runner.js` (CLI) and `app/test.html` (browser) per Rule 11.

---

## Generator Expansion Needs

Generators needed by the roadmap items, mapped to which items require them:

| Generator | Needed By | Exists? |
|-----------|-----------|:-------:|
| `Arbitrary.byteArray(min, max)` | T-01, T-02, T-03, E-01 | ✅ |
| `Arbitrary.string(min, max)` | T-05, T-06, E-03, E-06 | ✅ |
| `Arbitrary.integer(min, max)` | T-04, E-01, E-08 | ✅ |
| `Arbitrary.positiveInteger(max)` | E-06 | ✅ |
| `Arbitrary.byte()` | various | ✅ |
| `Arbitrary.uint8Array(exactLength)` | T-04, M-04, H-01 | ✅ |
| `Arbitrary.dctBlock()` | H-01, H-02 | ✅ |
| `Arbitrary.pixelBlock(w, h)` | E-01, M-06, H-02 | ✅ |
| `Arbitrary.oneOf(...values)` | M-04, M-09, H-02 | ✅ |
| `Arbitrary.record({k: gen})` | M-06, M-07, H-02 | ✅ |
| `Arbitrary.frequency([[w, gen]])` | M-07, H-02 | ✅ |
| `Arbitrary.suchthat(gen, pred)` | M-04, H-01 | ✅ |
| `Arbitrary.bitSequence(min, max)` | M-02 | ✅ |

**8 new generators** needed. All should be added in H-03 but can be implemented
incrementally — only build a generator when its first consumer is being implemented.

---

## Success Metrics

When this roadmap is fully executed:

| Metric | Before | After |
|--------|-------:|------:|
| Source files with zero test coverage | 6 | 0 |
| PBT properties (total) | ~40 | ≥80 |
| Metamorphic Relations (total) | ~12 | ≥30 |
| Fuzz suites registered | 9 | 13 |
| Dedicated PBT test files | 3 | 13 |
| `Arbitrary` generators | 10 | 18 |
| Test files (total) | 127 | ~153 |

### Ordering Dependency Graph

```
T-01 ──┐
T-02 ──┼── M-01 (CRC+compression combo)
T-03 ──┤
T-04 ──┤
T-05 ──┤
T-06 ──┤
       │
E-01 ──┤
E-02 ──┤
E-03 ──┤
E-04 ──┤
E-05 ──┤
E-06 ──┤
E-07 ──┤
E-08 ──┤
E-09 ──┤
E-10 ──┤
       │
M-02 ──┤
M-03 ──┤
M-04 ──┤
M-05 ──┼── H-02 (test/pbt/ suite — needs properties from all prior items)
M-06 ──┤       │
M-07 ──┤       ├── H-03 (generators — built incrementally)
M-08 ──┤       │
M-09 ──┤       └── C-01 (tagging — after all suites exist)
       │
H-01 ──┘
H-04 ──── (independent — can be done anytime, but benefits all PBT/fuzz work)
```

Items at the same difficulty level have no ordering dependencies between them and can
be implemented in parallel.
