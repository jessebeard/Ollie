# Ollie — Deep Architecture & Code-Quality Audit

**Date:** 2026-08-20
**Method:** Line-by-line static audit of the high-risk inventory + empirical probes (all probes at repo root, `_probe_*.mjs`, exit 0)
**Scope files:** `src/codec/{encoder,decoder,transcoder,capacity-scanner}.js`, `src/information-theory/{steganography,f5-syndrome,jsteg,batch-embedder,batch-extractor,chunk-manager,payload-container}.js`, `src/information-theory/error-correction/{rs-interleaver,reed-solomon-codec,galois-field}.js`, `src/information-theory/cryptography/{pbkdf2,aes-gcm}.js`, `src/structures/vault/{immutable-vault,secure-record}.js`, `test/runner.js`
**Companion:** `CODE_REVIEW.md` (prior static review, 2026-08-20, 515/515 baseline). This report is independent; items it corroborates are marked `(prior C#)`, and new findings are flagged **NEW**.

## Severity legend

| Level | Meaning |
|---|---|
| CRITICAL | Remote, unauthenticated DoS reachable from a single forged carrier on the planned public-host roadmap |
| HIGH | Local DoS / silent data-loss path, or crypto weakness exploitable offline |
| MEDIUM | Correctness defect in a supported path, or contract violation with realistic trigger |
| LOW | Hygiene, dead code, or edge conditions unlikely to occur in production |

> **Note (added 2026-08-31 by Cy4 audit):** `src/information-theory/steganography/jsteg.js`
> has been removed from the source tree. Findings S-3 and S-4 (Jsteg legacy
> fallback, uncaught throws) and the jsteg references in A-2 are moot for the
> current codebase — `f5-syndrome.js` is the sole steganographic extraction path.
> See `docs/audits/Cy4-Codebuddy-audit.md` finding Cy4-5.

## Threat model (why this audit is security-shaped)

Ollie persists encrypted vaults in JPEG carriers and (roadmap) **publishes those carriers to public clear-web image hosts** as decentralized backups. Consequence: *any third party can submit a forged carrier to any client that decodes it.* The decoder path is an unauthenticated, remote, adversarial input surface. In JS this converts memory-safety-style bugs (unvalidated allocation sizes, OOB reads) into remote DoS, and missing integrity checks into silent forgery. Every finding below is assessed against that model.

---

# 1. Security & Cryptography

## S-1 — Forged container metadata drives an unbounded `ErrorCorrection.recover` allocation (CRITICAL, NEW)

`F5.extractContainer` (`src/information-theory/steganography/f5-syndrome.js:716–740`) parses the metadata JSON from the stego header and, on CRC mismatch with `metadata.ecc`, calls:

```js
const recovered = ErrorCorrection.recover(payload, metadata.eccProfile, metadata.originalLength, metadata.blockCount);
```

`metadata.eccProfile`, `metadata.originalLength`, `metadata.blockCount` are **attacker-controlled JSON with no validation** (`rs-interleaver.js:107–165`). In `_deinterleave` (`rs-interleaver.js:190–206`) the output buffer is:

```js
const totalRecovered = blockCount * dataBytes;
const result = new Uint8Array(originalLength !== null ? originalLength : totalRecovered);
```

V8 allows `new Uint8Array(2^32 - 1)` (1 GiB off-heap; measured: allocation succeeds, `rss` lags `external` by ~0.5 GB). So a **few-KB forged JPEG** can allocate **up to 4 GiB** of recovered buffer.

**Empirical proof (`_probe_payloadlen.mjs`, Part B):** crafted a 78-block F5 container (k=2, magic verified byte-exact, no cross-k collision) with metadata `{ecc:true, eccProfile:'Medium', originalLength:100_000_000, blockCount:100_000}` and a CRC deliberately mismatched. Fed to the **real** `F5.extractAuto` → printed `"F5: CRC mismatch, attempting ECC recovery..."` → **returned `{data: Uint8Array(100_000_000) of zeros, metadata: <forged>}` in 0.25 s, `rss` +126.4 MB — with no error.** The recovery "succeeded" silently (see S-5 for why).

**Decode-path amplification:** the decoder's per-component guard (`decoder.js`, `totalBlocks > 1000000` ⇒ reject) bounds the *extraction* walk, **not the `recover()` output size**. Max extractable payload via `decode()` ≈ 5.44 MB (3 M blocks × 63 AC × k=4 bits), but the forged `originalLength` is independent of it ⇒ small carrier → 4 GiB buffer, then `PasswordVault.load` runs `new TextDecoder().decode(4 GiB of zeros)` ⇒ ≥ 4 GB string attempt ⇒ RangeError/tab crash. **A single ~30 KB image can take down the browser tab that opens it.**

**Root causes (three compounding):**
1. Metadata fields are consumed as trust-bearing size hints.
2. `_deinterleave` reads `interleaved[bytePos * blockCount + blockIdx]` with **no check that `interleaved.length >= blockCount * 255`** → OOB reads return `undefined` → `0` (see S-5).
3. The all-zero buffer is a *valid* codeword (see S-5), so no error surfaces.

**Fix (mandatory before publishing to public hosts):** validate before `recover()`: `blockCount <= ceil(payload.length / 255) + ε`, `originalLength <= blockCount * dataBytes(profile)`, `eccProfile ∈ ECC_PROFILES`; drop or bounds-check the legacy else-branch (S-3); bounds-check `_deinterleave`; treat `payload.length < blockCount * 255` as an error, not zero-fill.

## S-2 — Forged `blockCount` DoS via direct `recover` (HIGH, NEW)

Same surface, second axis: `blockCount` alone (with a *real* 255 B block) controls the deinterleave loop size. `_probe_rs_dos.mjs`, Part A: real block + `blockCount = 200_000` → **silent success in 0.54 s, +514.7 MB rss, returned 48 bytes of zeros**. Part B: `originalLength = 1 << 30` → silent 1 GiB success. Part C: 20 000 all-zero blocks all decode "clean" at ~2 µs/block (CPU is cheap; **memory is the DoS axis**). Part D: `_recoverLegacy` with `payload.length < 4` → **uncaught `RangeError: Invalid typed array length: -1`** (negative `new Uint8Array(dataLength)` at `rs-interleaver.js:242`); a 4-byte payload with non-zero syndromes instead throws a zxing-style decoder exception — also uncaught.

Reachable today via the exported `ErrorCorrection.recover` API and via S-1; the legacy path is additionally reachable through Jsteg's else-branch (S-3).

## S-3 — Jsteg legacy fallback: uncaught exceptions + single-block RS mis-decode (HIGH, NEW)

`Jsteg.extractContainer` (`jsteg.js:352–377`) has a second recovery path inside the `if (metadata.ecc)` block:

```js
if (metadata.eccProfile && metadata.originalLength !== undefined) {
    const [recovered, recoverErr] = ErrorCorrection.recover(payload, eccProfile, originalLength, blockCount);
    ...
} else {
    payload = ErrorCorrection.recover(payload);   // legacy mode: single RS(255,251) block, NO try/catch
}
```

The else-branch is reached whenever the container metadata sets `ecc: true` **without** `eccProfile`/`originalLength` — i.e., on any forged container whose metadata is just `{"ecc": true}`. And it runs **regardless of the CRC outcome**: a CRC mismatch only forces an early `return null` when `!metadata.ecc`; with `ecc: true` a CRC match or mismatch both fall through to this branch. Inside, `_recoverLegacy` (`rs-interleaver.js:232–245`) treats the **entire payload as one RS(255, 251) block** and the call site has no error handling:

- **Short payload (`length < 4`):** `new Uint8Array(length − 4)` with a negative length ⇒ **uncaught `RangeError: Invalid typed array length: -1`** (measured, S-2 Part D); a short payload with non-zero syndromes instead throws a zxing-style decoder exception — also uncaught. Either way the promise rejects with a raw internal error.
- **Long payload:** `decoder.decode` runs on a word longer than one RS block; non-zero syndromes (the norm for non-RS data) drive the Euclidean algorithm into `throw 'Error locator degree does not match number of roots'` — **uncaught** — or, when roots happen to resolve, silently "corrects" non-RS bytes and returns mangled data as the payload.

Note the shape asymmetry is real but narrower than it looks: `_recoverLegacy` returns a **bare `Uint8Array`** (no tuple), so the else-branch's assignment is type-consistent; the hazards are the uncaught throws and the wrong-mode decode, not tuple unwrapping.

Jsteg is not in the production decode path (see A-2), so severity is HIGH (exported library API + any future wiring), not CRITICAL.

**Fix:** delete the legacy else-branch (the legacy single-block mode is the wrong mode for multi-block payloads), or wrap it in try/catch and validate `payload.length >= 4`; and apply S-1's metadata validation.

## S-4 — `BatchExtractor` attacker-controlled `chunk.total` → OOM/hang (CRITICAL, NEW)

`batch-extractor.js:85–95`:

```js
const expectedTotal = sorted[0].total;          // attacker-controlled (metadata JSON in carrier)
if (sorted.length !== expectedTotal) {
    const missingIndices = [];
    for (let i = 0; i < expectedTotal; i++) {    // expectedTotal up to 2^53
        if (!presentIndices.has(i)) missingIndices.push(i);
    }
    ... missingIndices.join(', ') ...
}
```

`expectedTotal` comes straight from the chunk metadata JSON embedded in the carrier (JSON numbers go to 2^53). A single forged carrier with `chunk.total = 1e8` (or any large value) and a non-matching index set makes `PasswordVault.load` allocate a ≥ 800 MB index array, build a multi-GB join string, and **crash or hang the tab**. Even `total = 1e7` costs seconds of CPU per load attempt. This is the cheapest remote DoS found: no CRC trickery needed — a normal-looking chunk set with one inflated `total` suffices, and it fires **before** `ChunkManager.reassemble`.

**Fix:** clamp `expectedTotal` to `sorted.length + maxMissingTolerance` (or simply `<= files provided`), and report missing indices by set difference without materializing a `total`-sized array: iterate `presentIndices` and compute expected set from `total` only after validating `total <= presentIndices.size + k`.

## S-5 — All-zero RS blocks decode "clean"; error floor is silent (HIGH, NEW — root of S-1/S-2)

Two independent facts make forged recovery *look successful*:

1. `ReedSolomonDecoder.decode` (`reed-solomon-codec.js:56–66`) computes syndromes and **returns immediately when all are zero** — and the all-zero block *is* a valid codeword, so an all-zero "recovered" buffer passes with no error.
2. `_deinterleave` OOB reads return `undefined`, which the assignment coerces to `0` — so a forged `blockCount` larger than the payload silently zero-fills the deinterleaved blocks instead of failing.

`_probe_rs_dos.mjs` Part A demonstrates the terminal effect: one real non-zero block + forged `blockCount=200_000` → the single non-zero value "corrects" to zero across all blocks and the decode **succeeds, returning 48 zero bytes as the payload**. There is **no post-recovery CRC re-check** (corroborates prior C16, now mechanism-confirmed): `recover`'s output goes straight to `JSON.parse`/decrypt. Encrypted vaults are protected by GCM tag failure; *unencrypted* payloads would surface only as parse errors — after the allocation damage is done.

**Fix:** bounds-check `_deinterleave` (hard error on short input); re-CRC the recovered payload when the container had a CRC; consider a non-zero-density sanity check as defense-in-depth.

## S-6 — Hardcoded PBKDF2 salt in `PasswordVault` (HIGH, prior C1 — independently re-confirmed)

`immutable-vault.js:25` and `:188`:

```js
const salt = new TextEncoder().encode('ollie-session-salt-1234');
```

The salt is a **public constant baked into shipped code** (both `_getSessionKey` and `static load`). PBKDF2 with a fixed, known salt collapses to a single offline dictionary attack against *every* vault simultaneously: one precomputed table of `PBKDF2(candidate, 'ollie-session-salt-1234', 100_000)` tests all users at once, and the salt's presence in the client source makes it a zero-effort target. A password manager's session key should never derive from a hardcoded salt.

**Fix:** per-vault random 16-byte salt + recorded KDF parameters, version the format, and migrate. **Placement (precise):** the KDF block — `{salt, iterations, wrappedSessionKey, wrapIV}` — belongs in the **vault document's `metadata` object (the JSON `metadata` inside the encrypted payload)**, not in the JPEG file header (Ollie writes no file header — stego lives in the AC coefficients; and re-encoding hosts strip EXIF/APP segments first — cf. Q-10) and not in the stego container's `Metadata:N` block (unencrypted, attacker-controlled JSON that S-1/S-4 show must be bounds-validated; duplicated across every chunk in the set; protected only by the weak CRC of S-5). Inside the payload, the KDF block is covered by the outer AES-GCM tag, so tampering fails authentication cleanly. No chicken-and-egg: the outer decrypt needs only the in-band salt (first 16 payload bytes, `f5-syndrome.js:449–460`); the KDF block is consumed only after the payload is decrypted. (This is also the natural companion to S-7 and the Rust port's format-version bump.)

## S-7 — PBKDF2 iterations = 100 000, below OWASP minimum (MEDIUM, prior C2 — re-confirmed)

`pbkdf2.js:7`: `static ITERATIONS = 100000;`. OWASP minimum for PBKDF2-HMAC-SHA256 is 600 000. Combined with S-6, the session key is a weak gate around the per-entry AES-GCM keys. Worse for the roadmap: the count is **nowhere in the format** — `deriveKey` hardcodes `this.ITERATIONS` (`pbkdf2.js:52`) and no field records it — so it is a compile-time constant. Bumping it changes every derivation and breaks all existing vaults; once carriers are published (immutable), the KDF strength of every published backup is frozen at 100 000 forever. The same gap exists for the *outer* stego payload key: `f5-syndrome.js:449–452` derives it with the same implicit constant (only its salt is per-embed and in-band), so parameterizing the outer count is part of the same fix.

## S-8 — AES-GCM parameter hygiene (MEDIUM, prior C3 — re-confirmed, scoped)

`aes-gcm.js`:
- **No AAD** — ciphertext is not bound to context; a chunk's ciphertext can be transplanted to another chunk/container position and still decrypt (mitigated in practice by per-chunk random salt ⇒ per-chunk unique key, but the binding is absent).
- **No IV length validation** before `decrypt` (WebCrypto rejects, but the tuple contract is `[null, e]` — fine; the gap is that nothing validates IV uniqueness across entries, which is acceptable given random 96-bit IVs).
- `pbkdf2.js` `deriveKey` uses `extractable: true` for the AES-GCM key — the session key can be serialized out of `crypto.subtle` by any code with a reference. Use `extractable: false`.

Net: the *encryption itself* is sound (AES-256-GCM, fresh random 96-bit IV per encrypt, per-chunk random salt ⇒ no key/IV reuse). The findings are binding/hygiene gaps, not breakable crypto.

## S-9 — Chunk checksums computed but never verified; no cross-chunk auth (MEDIUM, prior C15 — re-confirmed)

`chunk-manager.js:83–107`: `calculateChecksum` is a **32-bit additive sum** (weak primitive), and `reassemble` validates chunkId/total/index contiguity **but never compares `chunk.checksum` to recomputed values**. Consequence: a forged or corrupted chunk inside a complete set is silently reassembled. Encrypted vaults: GCM catches it at decrypt (good). Unencrypted payloads: silent corruption. With public-host publishing, this is the integrity gap that turns "bit-rot in a CDN" into "corrupt vault, no error."

**Fix:** upgrade to SHA-256 (WebCrypto, no deps), verify in `reassemble`, and re-CRC after ECC recovery (S-5).

## S-10 — `getPlaintextJSON` bulk plaintext export (LOW, prior C4 — re-confirmed)

`immutable-vault.js` exposes `getPlaintextJSON()`, returning the entire decrypted vault in one object. Fine for internal app flow; a landmine if ever surfaced in devtools-friendly state or reused by a future sync/export feature. No change required now; flag for API review.

## S-11 — `createPRNG` binary-seed truncation (LOW, NEW)

`f5-syndrome.js:33–41` (Uint8Array seed path):

```js
let state = 0;
const len = Math.min(seed.length, 8);
for (let i = 0; i < len; i++) state = (state << 8) | seed[i];
```

32-bit shift ⇒ **only the last 4 bytes of a ≥ 4-byte binary seed are effective**; bytes before that are dropped. Production always uses string seeds (`password || 'F5default'`), so severity is LOW — but a "seed" API that silently discards most of its input is a trap. Fix: fold all bytes (e.g., FNV-1a) or document the 4-byte contract.

## S-12 — Magic false-positive rate: measured, not estimated (informational, NEW)

`_probe_k_bruteforce.mjs`: 200 clean 128×128 q90 noise carriers (avg 768 blocks, 42 135 usable ACs) → `extractAuto` returned non-null **0/200 (0.00%)**, zero accidental `'F5SG'` hits (expected ≈ 200 × 2^−32 ≈ 4.7e-8). **The "97.7% false-extraction" reading is refuted:** 1 − 1e8/2^32 = 97.67% is the probability a garbage header is *rejected*, not extracted. The format-detection surface is not a realistic attack or false-positive vector. (The stale thinking at `f5-syndrome.js:541–565` — "design flaw if k is variable" — was resolved by the k=1..4 search; the comment should be deleted, see Q-4.)

The *legacy fallback* (`extractAuto` else-branch → `F5.extract`) is bounded: it reads a 4-byte length, caps at 100 MB, and `extractRaw` is **walk-bounded** (bits array grows only as far as the walk goes — no pre-allocation). Contrast: `Jsteg.extract` *does* pre-allocate `new Uint8Array(length)` up to 100 MB before walking (~2.3% of random 32-bit headers pass the cap) — LOW, Jsteg API only.

---

# 2. Code Quality

## Q-1 — Dead code: the tested serializer is not the shipping serializer (MEDIUM, NEW)

- `payload-container.js` (`ContainerFormat`) is a **second, bounds-checked implementation of the same `JSTG` container** (encode/decode/isContainer, flags, CRC) — and it is **used only in `test/container-format.test.js`**. Production Jsteg inlines its own serialization with the unvalidated-metadata path of S-1/S-3. The well-tested artifact does not run.
- `Jsteg` is exported from `steganography/index.js` but **not referenced by any production src path** (decoder calls `F5.extractAuto` only).
- `BatchEmbedder.estimateCapacity` (`batch-embedder.js:248`) is never called (production uses `F5.calculateCapacity` directly at `batch-embedder.js:153`).
- `Jsteg.getCategory` (`jsteg.js:44`) is never called; its JSDoc ("prevent Huffman encoding expansion") is an **overclaim** — the |val|=1 → 2/3 mapping changes category 1→2 (code-length change) and 3→2 shrinks; net size impact is small but non-zero, and the comment asserts the opposite.

**Recommendation:** delete `ContainerFormat`/`Jsteg`/`estimateCapacity`/`getCategory` or wire the bounds-checked serializer into production. Shipping two divergent implementations of one format is how S-3 happened.

## Q-2 — Return-shape asymmetry in `embedContainer` (MEDIUM, prior C9/C23 — re-confirmed, precisely scoped)

`F5.embedContainer` (`f5-syndrome.js:210–244`) returns, in different branches:
- `{ success: false, error }` — **truthy object** — for salt/KDF/encrypt failures;
- `null` — for ECC-protect failure;
- `result.success` — a **boolean** — from `embedRaw` (which returns `{success:false,k}` on coefficient exhaustion ⇒ `false`, or `true`).

`encoder.js:88–92`:

```js
const result = await F5.embedContainer(allBlocks, this.options.secretData, metadata, { password: this.options.password });
if (!result) {
    return [null, new Error('Failed to embed secret data into image.')];
}
return [true, null];
```

The truthy `{success:false,error}` **slips past `!result`** ⇒ the encoder reports success with **nothing embedded** (crypto stack failure ⇒ block array returned untouched ⇒ a carrier JPEG with no secret, and the user believes the backup exists). Exhaustion (boolean `false`) *is* caught — so the gap is scoped to the three crypto-failure paths, but the consequence (silent no-backup) is severe. `Jsteg.embedContainer` has the same shape family (`false` / `null` / boolean).

**Fix:** standardize on the tuple (spec rule); make `embedContainer` return `[result, error]` and have the encoder destructure.

## Q-3 — Tuple-contract violations at call sites (MEDIUM, prior C10/C11/C18 — re-confirmed)

- `batch-embedder.js:106`: `if (decodeErr) throw decodeErr;` — **throws** inside an otherwise tuple-based `embed()` (caller `save()` propagates; `encode` contract is `[result, error]`).
- `batch-extractor.js:116`: `return null; // or perhaps return [null, reassembleErr]` (bare, on reassemble error) — the inline comment shows the author knew the contract was uncertain. The caller destructures `const [vault, err] = await extractor.extract(...)` ⇒ **TypeError on the error path** (destructuring `null` is not iterable). The error path is worse than the success path.
- `immutable-vault.js` `save()`: `if (embedErr) throw embedErr;` — throws instead of tuple.
- `rs-interleaver.recover`: profile mode returns a **tuple**, legacy mode returns a **bare `Uint8Array`** or throws — Jsteg's legacy else-branch (S-3) has no try/catch, so those throws go uncaught.

## Q-4 — Stale thinking-process comments committed to production (LOW, prior S4/S6 — re-confirmed)

- `jsteg.js:1–17`: "Wait, Jsteg specifically skips 0 and 1?... Let's stick to skipping 0s only... Let me double-check..." — the author's deliberation, shipped.
- `f5-syndrome.js:541–565`: "This is a design flaw in the container format if k is variable... FIX: We will try k=1, 2, 3, 4" — the fix was made; the debate remains, directly above the code that implements it.
- `encoder.js:322–325`: "Wait, we're in encodeCoefficients... but we still need to handle the secretData... This is a bug in my logic" — stale; the handling below is correct.
- `jsteg.js:544` (`JstegReader.readBit`): rambling narrative comment.
- `batch-extractor.js`: inline rambling about "mock metadata" — which leads into Q-5.

These read as unresolved design debates and misdirect future maintainers. Delete.

## Q-5 — `BatchExtractor` mock metadata + hardcoded filename (MEDIUM, prior C12 — re-confirmed, mechanism identified)

`batch-extractor.js:119–128`: after successful reassembly,

```js
const firstMetadata = chunks.find(c => c.chunkId === completeGroup[0].chunkId);
return [{ data: reassembled, filename: firstMetadata ? 'vault.json' : 'unknown',
          metadata: { chunk: completeGroup[0] } }, null];
```

`firstMetadata` is **overwritten with the chunk wrapper** `{chunkId, index, total, data, checksum}` — so the returned "metadata" is *the first chunk's data bytes*, not the original file metadata; the filename is hardcoded `'vault.json'`; the real per-file metadata is dropped on every restore. Also note `chunk.checksum` values travel through the whole pipeline and are **never compared** (S-9).

## Q-6 — Unconditional console.log spam (LOW, prior S7 — re-confirmed with measurement)

`encoder.js` logs every header, every DHT table, every scan; `F5.embedRaw` logs on call; `batch-embedder` logs per file. Measured in the k-bruteforce probe: **×200 images of "JpegEncoder.encode called / Writing headers... / writeDHT / scan" lines** in 7.3 s. In a shipping password manager this is noise, a minor perf cost, and a (tiny) side channel in shared devtools. Remove or gate behind a debug flag.

## Q-7 — In-place mutation without documented contracts (MEDIUM, prior S2/C31 — re-confirmed)

`F5.embedRaw`, `Jsteg.embedRaw`, `ReedSolomonEncoder.encode`, `ReedSolomonDecoder.decode` all **mutate the caller's buffers** with no JSDoc statement that they do. Worse for the Rust port: `GenericGFPoly`'s constructor (`galois-field.js:57–71`) strips leading zeros via `coefficients.subarray(firstNonZero, ...)` — a **view sharing the caller's backing buffer**; aliasing is now invisible, and a future "optimization" that reuses the source buffer will corrupt polynomials mid-decode.

## Q-8 — zxing Java port artifacts in the ECC core (LOW, prior S4 — re-confirmed)

`reed-solomon-codec.js` throws with message strings like `'IllegalArgumentException("No error correction bytes")'` and `'ReedSolomonException("r_{i-1} was zero")'` — Java exception *class names inside message text*, no JSDoc anywhere in the file. Errors are caught and re-wrapped by `rs-interleaver` (`'ECC recovery failed on block i: ...'`), so behavior is fine; the surface is just unportable-as-is (a Rust port should map these to proper error variants).

## Q-9 — `secure-record.js` validation + serialization bloat (MEDIUM, prior C19/C20 — re-confirmed)

- `fromJSON` (`secure-record.js:124–146`) performs **no field validation**: `data.tags` undefined ⇒ `decrypt` later throws at `[...this.tags]` inside its try/catch ⇒ `[null, e]` — a malformed vault entry surfaces as a *decrypt* error, not a *parse* error.
- `toJSON` serializes `ciphertext`/`iv` as **JSON number arrays** (`Array.from(...)`) — ≈ 3× the bytes of base64, inflating vault payload and capacity planning on every save. Use base64 (WebCrypto-adjacent, no deps: `btoa`/`Buffer` shim already exists in the codebase's environment).

## Q-10 — Transcoder: "lossless" is true for coefficients only; EXIF silently stripped (MEDIUM, NEW)

`transcoder.js:33–79`: `updateSecret` re-encodes via `JpegEncoder.encodeCoefficients` — **no re-quantization** (uses the decoded `quantizationTables` via `writeHeadersWithTables`), so DCT coefficients are bit-exact (corroborates prior S1). But the from-scratch writer **emits only SOI/APP0/DQT/SOF/SOS** — every APP segment in the user's photo (EXIF, GPS, XMP, ICC profiles, thumbnails) is **silently dropped** on the batch-embed "lossless path." For a password manager that stores *user photos as carriers*, silently stripping EXIF/GPS is a user-visible data loss. Additionally: the `new JpegEncoder(90, ...)` quality argument is vestigial on this path (coefficients carry their own precision), and grayscale input (3 components → warning; < 3 → `idCb` undefined ⇒ likely crash in `prepareBlock`).

**Fix:** either carry APP segments through `encodeCoefficients` (collect in decoder, re-emit), or make the stripping explicit and opt-in with a warning.

## Q-11 — Capacity accounting: scanner and embedder disagree (MEDIUM, NEW)

Two different capacity models run in production:

- `CapacityScanner` default analyzer (`capacity-scanner.js:43`): `F5.calculateCapacity(allBlocks, options.f5Options || {})` — **empty options ⇒ `format !== 'container'` ⇒ legacy branch** (`capacityBytes − 4`, no container overhead, no ECC shrinkage).
- `BatchEmbedder.embed` (`batch-embedder.js:153–165`): `F5.calculateCapacity(..., { format: 'container', metadata, ecc: useEcc, eccProfile, encrypted })` with the vault's `eccProfile: 'Extreme'` (85/255 ⇒ **33% efficiency**).

So the capacity UI reports ~3× the usable capacity of what the embedder will actually accept ⇒ the user is told "these images hold your vault," then `save()` fails (or silently falls back to no-ECC at `encoder.js:69–80` — which changes the durability profile the user asked for). The embedder's own estimate compounds the skew: it uses `representativeMetadata = {filename:'placeholder_filename.ext', chunk:{index:99,total:99,start:999999,end:999999}, checksum:'0'.repeat(32)}`, while the real per-chunk metadata later is `{filename, chunk:{id:<36-char uuid>, index, total}, checksum:<number>}` — different JSON size (no `id` in the representative, `start/end` instead) ⇒ `metaLen` mismatch ⇒ systematic over/under-estimate at the image-size edge.

**Fix:** one capacity function, one metadata template; the scanner should call the same container-mode calculation the embedder uses.

---

# 3. Performance & Rust-Migration Readiness

## P-1 — `bits[]` JS array: 10.3 B/bit steady state (NEW, measured)

`extractRaw` accumulates bits in a plain JS array. `_probe_payloadlen.mjs` Part A measured **65.8 B/bit under allocation churn (1 M bits, pre-GC) and 10.3 B/bit steady (4 M bits, post-GC)**. Implications:

- Direct API, 100 MB container payload ⇒ ≈ 810 M bits ⇒ **~8.4 GB transient** (plus the S-1 buffer) — this is why the 100 MB `payloadLen` cap matters and why the cap guard (`f5-syndrome.js:691–695`) is correctly placed *before* `fullContainer = extractRaw(...)`.
- Via `decode()`, the 1 M-blocks/component guard bounds the walk ⇒ max ≈ 5.44 MB payload ⇒ **~450 MB transient bits** — realistic worst case per image.

**Rust:** a `Vec<u8>` bit buffer is 8× smaller; this class of cost disappears.

## P-2 — `extractRaw` called 2–6× per extraction, each rebuilding the permutation (NEW, structural)

`extractAuto`'s k-search calls `extractRaw` up to 4× (k=1..4, 32-bit header each), then a fallback 32-bit read, then `extractContainer`'s header read, then the full read — each call re-runs `createPRNG` + Fisher-Yates over all N AC indices and re-walks. For a 3 M-block image that is 6× the permutation cost and 6× the coefficient walk. **Rust:** trivially cheap (u64 LCG, no BigInt), but the *structure* (re-walk per k) should still collapse: one walk can emit all four k interpretations from the same group sequence since the group partition is k-dependent — at minimum, cache the permutation per (blocks, seed).

## P-3 — Object churn in the F5 hot path (NEW)

- `extractRaw` pushes a `{val}` object per coefficient (to keep sign) — N objects per call, ×2–6 (P-2).
- `F5.calculateCapacity` (`f5-syndrome.js:774–793`) builds an entry object **per usable coefficient** in `collectUsableCoefficients`, just to count them.
- `createPRNG`'s LCG is **BigInt** (`a = 25214903917n, m = 1n << 48n`) — boxed arithmetic per permutation step.

**Rust:** all three become primitive `u16`/`u64` loops; expect the F5 layer to be the single largest port speedup.

## P-4 — V8 semantics the code implicitly relies on (NEW — port hazards)

Empirically confirmed, and **not portable**:

| JS behavior (relied on / observed) | Rust equivalent |
|---|---|
| OOB typed-array read → `undefined` → assigned `0` (silent zero-fill; S-1/S-2 depend on it not *erroring*) | OOB index = panic (debug) / UB (release) — **Rust would catch the `_deinterleave` OOB as a bug; the silent zero-fill is a feature of the bug today** |
| `new Uint8Array(2^32 − 1)` succeeds off-heap (rss lags `external` ~0.5 GB) | `Vec::with_capacity` fails cleanly at alloc — port should add the S-1 bounds check *and* keep an explicit size guard |
| Negative typed-array length → `RangeError` (S-2 Part D) | `try_reserve`/`Vec` — caught by construction |
| JS array ~4 GB compressed-heap ceiling (bits[] churn) | N/A |

**Porting rule:** do not port behavior, port *intended* behavior; every implicit JS tolerance above becomes an explicit check (several are the S-1..S-4 fixes anyway).

## P-5 — Reed–Solomon: memory-dominant, ~2 µs/block (NEW, measured)

`_probe_rs_dos.mjs`: 20 000 all-zero blocks decode "clean" at ~2 µs/block (fast path: 2×32 field evaluations per block); a genuinely corrupted block pays Euclid + a 255-step root scan. The DoS axis is **memory** (S-1/S-2), not CPU. Per-call allocation of `GenericGF` polynomial objects in `runEuclideanAlgorithm` is fine at 255 B/block in JS; in Rust, map to stack arrays / in-place ops to avoid an alloc storm at batch scale, and re-derive the `subarray` aliasing (Q-7) as explicit lifetimes.

## P-6 — Verified-correct substrate for the port (NEW)

- **4:2:0 path verified end-to-end** (`_probe_420_roundtrip_v3.mjs`): both 4:4:4 and 4:2:0 carriers round-trip secret bytes **byte-exact** (48/48 in v2; both subsamplings exact in v3, pixels within bounded subsampling delta, 4:2:0 RMSE 5.155). The per-subsampling scan logic and `upsampleChromaBlocks` (the only lossy branch, for non-4:2:0/4:4:4 ratios) are correct as written — the port can carry them over with confidence. Finding #46 (scan-order vs embed-order) is **refuted** by this probe.
- `encodeCoefficients` (`encoder.js:419–504`) is a **clean port boundary**: input = coefficient blocks + quant tables + dimensions, output = bytes; no state, no side channels except the secret-embed step and console noise. The codec layer (encoder/decoder/transcoder) and the information-theory layer (F5/RS/ECC) are two self-contained port units; crypto stays on WebCrypto in JS (Rust: `aes-gcm` crate), with the S-6/S-7 salt+iteration change as the format-versioning opportunity.

---

# 4. Architecture, API Contracts & Test Coverage

## A-1 — The Result-tuple contract is specified and systematically violated (MEDIUM, NEW as a summary)

The codebase's spec rule (tuple `[result, error]`, throw-free) is violated at: `F5.embedContainer` (Q-2), `Jsteg.embedContainer` (Q-2), `batch-embedder.embed` (Q-3 throw), `batch-extractor.extract` (Q-3 bare null), `immutable-vault.save` (Q-3 throw), `rs-interleaver.recover` (Q-3 dual shape), and consumed incorrectly by `encoder.js` (Q-2 truthy gap); `jsteg.js`'s legacy else-branch (S-3) additionally has no error handling at all. The silent-success class (encoder reports embedded when it did not; recover reports recovered when it zero-filled) all trace to this one contract gap. **One PR should standardize the tuple across the six surfaces and add contract tests.**

## A-2 — Public API surface exceeds production usage (MEDIUM, NEW)

`steganography/index.js` exports `Jsteg`, `F5`, `ChunkManager`, `ErrorCorrection`. Production (decoder → F5; vault → Batch{Embed,Extract}or → F5 + ChunkManager + ErrorCorrection) never touches `Jsteg`. `ContainerFormat` is test-only. The public surface thus advertises two stego engines and two container serializers, one of each pair unused, and the *used* JSTG serializer is the unvalidated one (S-1/S-3). For a library heading toward a Rust port and public carriers, the export surface should match the shipped path; trim or promote.

## A-3 — Layering and dependency direction (positive)

`codec` (bytes ⇄ coefficients) → `information-theory` (stego/ECC) → `cryptography` (WebCrypto) → `structures` (vault/records) → `app`. No upward imports observed in the audited inventory; the vault layer is thin and immutable-patterned (frozen instances). Zero runtime dependencies holds (WebCrypto + `Buffer` shims only). This is the strongest part of the codebase and the reason the port can proceed layer-by-layer.

## A-4 — Test coverage: 515/515 green, but the adversarial surface is untested (MEDIUM, NEW)

The suite is green at baseline and exercises container format, capacity, chunks, crypto. Gaps found by this audit, each corresponding to a finding above:

| Missing test | Finding it would have caught |
|---|---|
| `extractAuto` on N clean carriers (false-positive rate) | S-12 (would have pinned the 0/200 baseline) |
| Forged container metadata → `recover` (large `originalLength`/`blockCount`) | S-1, S-2 |
| `Jsteg.extractContainer` without `eccProfile` (legacy else-branch) | S-3 |
| `BatchExtractor` with attacker-inflated `chunk.total` | S-4 |
| `_recoverLegacy` with payload < 4 bytes | S-2 Part D |
| KDF block: two vaults, same password ⇒ distinct `{salt, wrappedSK}`; tamper any KDF field ⇒ clean auth error, not a crash; iteration upgrade ⇒ entry ciphertexts byte-identical | S-6, S-7 |
| Pixel-path secret roundtrip (encode pixels → decode → compare secret), 4:4:4 **and** 4:2:0, incl. 144×144 | none exists today; `_probe_420_roundtrip_v3.mjs` fills the 4:2:0 hole |
| Capacity-consistency: scanner estimate vs embedder acceptance for the same image set | Q-11 |
| `PasswordVault.save → load` full cycle with APP-segment input (EXIF survives?) | Q-10 |
| Chunk checksum verification (once implemented) | S-9 |

The pixel path + secret embedding is **untested end-to-end in the suite** — the core product flow. (My probes are at repo root as disposable evidence; they should be promoted to `test/` as permanent regression tests.)

## A-5 — Verification summary (what this audit empirically established)

| Probe | Question | Result |
|---|---|---|
| `_probe_420_roundtrip_v2/v3.mjs` | Does 4:2:0 break secret roundtrip (#46)? | **Refuted.** v2: 48/48 secret bytes exact. v3: both subsamplings byte-exact; 4:2:0 pixel delta bounded, RMSE 5.155. |
| `_probe_rs_dos.mjs` A–D | Can forged `recover` args DoS? | **Proven.** 200k-block forged `blockCount` → silent 48-byte zero success, +514.7 MB, 0.54 s. 1 GiB `originalLength` → silent 1 GiB buffer. All-zero blocks decode clean (~2 µs/block). Tiny legacy payload → uncaught `RangeError(-1)`. |
| `_probe_payloadlen.mjs` A–C | Cost of `extractRaw` + end-to-end chain + cap guard | bits[] 10.3 B/bit steady (65.8 churn) ⇒ 100 MB cap ≈ 8.4–8.7 GB transient (direct API) / ~450 MB via decode path. Forged container → real `extractAuto` → **100 MB zero buffer returned as "data", 0.25 s, no error**. 128 MB `payloadLen` field → cap guard fires pre-extraction, null in 0.00 s. |
| `_probe_k_bruteforce.mjs` | False-positive extraction on clean carriers | **0/200 non-null, 0 magic hits** (expected ~4.7e-8). "97.7% false-extraction" reading refuted (it is the header-*rejection* probability, 1 − 1e8/2^32 = 97.67%). Runtime 7.3 s; captured encoder console.log ×200 (Q-6). |

## A-6 — Roadmap risk statement

Publishing carriers to public image hosts promotes every extraction-path defect from "local corruption" to "remote, unauthenticated DoS against any client that fetches the set." **S-1, S-2, S-3, S-4 must be fixed (and regression-tested per A-4) before the first carrier is published**; S-6/S-7 (salt/iterations) should ship in the same format-version bump since published carriers make the KDF parameters permanently visible, the migration window closes, and — because the iteration count is currently unrecorded (S-7) — the first published set also freezes KDF strength forever.

## Ordered fix list (recommended sequence)

1. **Validate forged metadata before `recover()`** (S-1/S-2/S-5): `blockCount ≤ ceil(payloadLen/255) + ε`, `originalLength ≤ blockCount × dataBytes(profile)`, `eccProfile ∈ ECC_PROFILES`; bounds-check `_deinterleave`; re-CRC recovered payload.
2. **Delete Jsteg's legacy else-branch** (S-3) or wrap it in try/catch with a `payload.length >= 4` guard.
3. **Clamp `chunk.total` to files provided** in `BatchExtractor` (S-4).
4. **Per-vault random salt + recorded KDF parameters + wrapped session key + AAD + `extractable: false`** (S-6/S-7/S-8), as a format version bump: random 16-byte salt per vault; the session key becomes random and persists only wrapped (AES-GCM) under a vault key `PBKDF2(password, vaultSalt, iterations)`; the KDF block `{salt, iterations, wrapIV, wrappedSK}` is recorded in the **vault document's `metadata` inside the encrypted payload** (GCM-authenticated — not the JPEG header, not the container `Metadata:N`; see S-6). The outer stego key's iterations, once parameterized, go in the container `Metadata:N` (per-embed state, next to `eccProfile`/`originalLength`) and **must be validated to a bounded integer range** (e.g. 100k–10M) — an unvalidated `iterations` field is a new PBKDF2-spin DoS on load. Because the session key is wrapped rather than derived, iteration upgrades and password changes rewrite only the KDF block — entry ciphertexts stay untouched.
5. **Verify chunk checksums** (upgrade additive sum → SHA-256) in `reassemble` (S-9).
6. **Standardize the result tuple** across the six surfaces; fix the `encoder.js` truthy gap (Q-2/Q-3/A-1).
7. **Delete or wire up** `ContainerFormat`, `Jsteg`, `estimateCapacity`, `getCategory` (Q-1/A-2); strip stale thinking comments (Q-4); remove console.log spam (Q-6); fix scanner/embedder capacity divergence (Q-11); make transcoder APP-segment stripping explicit (Q-10); base64 the ciphertext serialization (Q-9).
8. **Promote probes to `test/`** per the A-4 table.

---

*Audit performed read-only against production code; all empirical evidence reproducible via `node _probe_*.mjs` from the repo root (Node v24.18.0). Probe files are disposable artifacts and candidates for deletion or promotion per A-4.*
