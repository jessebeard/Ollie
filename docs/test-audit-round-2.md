# Ollie Test Infrastructure Audit (Round 2)
**Date:** September 2026  
**Target:** New Property-Based Testing (PBT) Suites (`test/pbt/`), Metamorphic Fuzz Target (`test/fuzz/juniward-mr.mjs`), and Fuzz Runner (`scripts/fuzz.mjs`)  
**Status:** Comprehensive Sanity Check Completed (994/994 Tests Passing, but Significant Weaknesses Identified)

---

## Executive Summary

Following the full implementation of the Multi-Methodology Test Coverage Roadmap across Trivial, Easy, Moderate, Hard, and Complex tiers, the test suite expanded to **994 passing tests** across Node CLI (`test/runner.js`) and Browser (`app/test.html`).

A rigorous, line-by-line sanity check and mutation-sensitivity audit was conducted across all 12 newly introduced test and runner files:
- 10 dedicated property-based testing suites in `test/pbt/`
- 1 metamorphic relation fuzz harness in `test/fuzz/juniward-mr.mjs` and its smoke wrapper `test/fuzz/juniward-mr.test.js`
- Fuzz suite registry metadata in `test/fuzz/suites.mjs` and CLI runner in `scripts/fuzz.mjs`

### Audit Verdict: High Surface Coverage, Masked Defects

> [!WARNING]
> **All 994 tests pass green, but the test oracle strength is compromised in multiple critical modules.**
> 
> Due to a systemic off-by-one convention mismatch in the PBT generator engine, parameter name mismatches, deterministic data generation, and vacuous mathematical invariants:
> - **12 Critical Defects** allow completely broken, hollow, or non-functional implementations to pass.
> - **15 Medium-Severity Weaknesses** dilute mutation-killing power.
> - **8 Minor Nits** introduce dead code and test pollution.

---

## Systemic Finding: Generator Upper-Bound Exclusivity Mismatch

In `test/utils/pbt.js`:
```javascript
function getRandomInt(min, max) {
    return Math.floor(nextRandom() * (max - min) + min);
}
```
`getRandomInt(min, max)` calculates a pseudo-random integer in the interval $[min, max)$. The upper bound $max$ is **strictly exclusive**.

Throughout all newly authored PBT suites, tests assumed that `Arbitrary.integer(min, max)` was inclusive of $max$. This created systematic off-by-one errors and test dead zones:

| Suite & Line | Generator Call | Effective Range | Intended Element Never Generated |
|:---|:---|:---:|:---|
| `ecc.pbt.js:51` | `Arbitrary.integer(0, 1)` | **`[0, 0]` (Always 0)** | Index 1 (Causes single-byte corruption to always target index 0) |
| `crypto.pbt.js:35` | `Arbitrary.integer(0, 7)` | `[0, 6]` | Bit index 7 (`0x80` MSB bit flip never tested) |
| `crypto.pbt.js:74` | `Arbitrary.integer(0, 29)` | `[0, 28]` | Second 29 (The critical 30-second TOTP boundary second) |
| `ecc.pbt.js:11,28` | `Arbitrary.integer(0, 255)` | `[0, 254]` | Field element `255` (`0xFF`, highest Galois Field element) |
| `algebraic.pbt.js:10`| `Arbitrary.integer(0, 255)` | `[0, 254]` | Value `255` (Full color saturation / pure white) |
| `algebraic.pbt.js:70`| `Arbitrary.integer(1, 32)` | `[1, 31]` | Quantization step 32 |
| `codec.pbt.js:28` | `Arbitrary.integer(2, 4)` | `[2, 3]` | Dimension multiplier 4 (restricts PBT to only 2 static sizes) |
| `secret-sharing.pbt.js:8`| `Arbitrary.integer(2, 5)` | `[2, 4]` | Threshold $k = 5$ |
| `secret-sharing.pbt.js:8`| `Arbitrary.integer(1, 3)` | `[1, 2]` | Redundant shares $extra = 3$ |

**Actionable Remedy:**
Either modify `getRandomInt` in `test/utils/pbt.js` to `Math.floor(nextRandom() * (max - min + 1) + min)` (standard inclusive contract), or systematically audit and increment all upper bounds by $+1$.

---

## 🔴 Critical Defects Breakdown (12)

### C-01: TOTP Option Name Mismatch (Trivially Passing Tautology)
- **File:** `test/pbt/crypto.pbt.js:79–80`
- **Source Module:** `src/information-theory/cryptography/totp.js:28`
- **Root Cause:**
  `totp.js` specifies:
  ```javascript
  const now = (options.now !== undefined) ? options.now : (Date.now() / 1000);
  ```
  The PBT test passes:
  ```javascript
  const [codeA] = await totp(key, { timestamp: baseTimestamp });
  const [codeB] = await totp(key, { timestamp: offsetTimestamp });
  ```
  Because `timestamp` is passed instead of `now`, `options.now` is `undefined`. Both invocations fall back to `Date.now() / 1000`, executing within milliseconds of each other.
- **Impact:** The generated `baseTimestamp` and `offsetTimestamp` are completely ignored. `codeA === codeB` checks wall-clock time against wall-clock time. The test is a 100% tautology.
- **Remediation:** Change `{ timestamp: ... }` to `{ now: baseTimestamp }` and `{ now: offsetTimestamp }`. In addition, assert that `{ now: baseTimestamp + 30 }` produces a different OTP token.

---

### C-02: Reed-Solomon Single-Error Corruption Locked to Index 0
- **File:** `test/pbt/ecc.pbt.js:51–61`
- **Source Module:** `src/information-theory/error-correction/reed-solomon-codec.js`
- **Root Cause:**
  ```javascript
  [Arbitrary.byteArray(8, 20), Arbitrary.integer(0, 1)],
  (data, corruptIdx) => {
      ...
      codeword[corruptIdx] ^= 0x55;
  ```
  `Arbitrary.integer(0, 1)` yields strictly `0`. `corruptIdx` is **always 0**.
- **Impact:** The test asserts that RS corrects up to $\lfloor ecBytes/2 \rfloor$ errors, but only ever injects **a single error at index 0**. Codeword indices $1 \dots N-1$ and parity symbols are never corrupted. A broken RS decoder that only repairs index 0 passes.
- **Remediation:** Generate an error count $e \in [1, \lfloor ecBytes/2 \rfloor]$ and pick $e$ distinct random indices across $0 \dots \text{codeword.length} - 1$. Add a companion property asserting that $e = \lfloor ecBytes/2 \rfloor + 1$ errors returns an error tuple (`err !== null`).

---

### C-03: Cauchy MDS Erasure Deterministic Drop Slice
- **File:** `test/pbt/secret-sharing.pbt.js:16`
- **Source Module:** `src/information-theory/secret-sharing/cauchy-ec.js`
- **Root Cause:**
  ```javascript
  // Select any k chunks (e.g. drop first `extra` chunks)
  const survivingChunks = chunks.slice(extra);
  ```
- **Impact:** The test promises recovery from *"ANY k of n chunks"*, but hardcodes dropping chunks $0 \dots extra - 1$. It never tests:
  - Preserving systematic prefix chunks $0 \dots k - 1$
  - Dropping parity suffix chunks
  - Interleaved or arbitrary drop masks (e.g., chunks 0, 2, 4)
  - Shuffled/unordered chunk reception
- **Remediation:** Shuffle chunk indices via Fisher-Yates and select the first $k$ chunks to genuinely test arbitrary subset reconstruction and index-order resilience.

---

### C-04: Optimized Huffman Decoder Tautological Assertion
- **File:** `test/pbt/automata.pbt.js:46–64`
- **Source Module:** `src/automata/entropy-coding/huffman-optimized-fsm.js`
- **Root Cause:**
  Arbitrary random bytes are fed into `decodeOptimized`. The test asserts:
  ```javascript
  if (err) {
      expect(err instanceof Error).toBe(true);
      expect(sym).toBe(null);
  } else {
      expect(typeof sym).toBe('number');
      expect(sym >= 0 && sym <= 11).toBe(true);
  }
  ```
- **Impact:** A dummy implementation that unconditionally returns `[0, null]` passes. A dummy implementation that unconditionally returns `[null, new Error()]` passes. No symbol is ever encoded and checked for roundtrip recovery.
- **Remediation:** Replace with an encode-then-decode property: take an arbitrary sequence of symbols $s_i \in [0, 11]$, encode them using the canonical Huffman table into a bitstream, and verify that `decodeOptimized` recovers the exact original symbol sequence without errors.

---

### C-05: Codec Dimension Preservation Has Zero Pixel Verification
- **File:** `test/pbt/codec.pbt.js:11–26`
- **Source Module:** `src/codec/encoder.js`, `src/codec/decoder.js`
- **Root Cause:**
  ```javascript
  expect(decErr).toBe(null);
  expect(decoded.width).toBe(width);
  expect(decoded.height).toBe(height);
  expect(decoded.data.length).toBe(width * height * 4);
  ```
- **Impact:** Not a single byte of pixel data in `decoded.data` is inspected. A decoder returning a completely black image (`new Uint8ClampedArray(w * h * 4)`), inverted colors, or garbage noise passes 100% of runs.
- **Remediation:** Add an image fidelity assertion: calculate Mean Squared Error (MSE) or Peak Signal-to-Noise Ratio (PSNR) between `img.data` and `decoded.data`. Assert that for quality 85, $\text{PSNR} > 30\text{ dB}$ (or $\text{MSE} < 150$).

---

### C-06: StegoEngine Capacity Invariant Evaluates to $0 \ge 0$
- **File:** `test/pbt/steganography.pbt.js:57–77`
- **Source Module:** `src/information-theory/steganography/stego-engine.js:33`
- **Root Cause:**
  `calculateCapacity` requires framing overhead:
  $$\text{overhead} = \text{SALT\_BYTES}(16) + \text{TAG\_BYTES}(16) + 4 = 36\text{ bytes}$$
  In the test's `makeBlock`, non-zero AC count per block is $42$. At `targetBpnzAC = 0.05`, each non-zero AC yields $0.05 / 8 = 0.00625$ bytes. To exceed 36 bytes of overhead, minimum blocks required:
  $$N > \frac{36}{42 \times 0.00625} \approx 137.14 \implies \mathbf{138\text{ blocks minimum}}$$
  The generator generates `baseCount ∈ [10, 30]` and `addCount ∈ [5, 20]`, yielding at most $30 + 20 = 50$ blocks.
- **Impact:** At 50 blocks, gross capacity is $\lfloor(50 \times 42 \times 0.05) / 8\rfloor = 13$ bytes. Subtracting 36 bytes yields negative capacity, which clamps to `0`. `capA` is `0` and `capB` is `0` on **100% of test runs**. The assertion `expect(capB).toBeGreaterThanOrEqual(capA)` evaluates to `0 >= 0` every time.
- **Remediation:** Set `baseCount` to $\ge 150$ blocks (or reduce `targetBpnzAC` threshold / overhead in test helper) so capacity is strictly positive and truly monotonic.

---

### C-07: Vault Serialization Roundtrip Omits Encrypted Password
- **File:** `test/pbt/vault.pbt.js:6–34`
- **Source Module:** `src/structures/vault/immutable-vault.js`, `src/structures/vault/secure-record.js`
- **Root Cause:**
  `SecureEntry` splits record fields:
  - Public unencrypted metadata: `title`, `username`
  - Sensitive encrypted payload: `password`, `notes`, `totp`, `customFields`
  The test asserts:
  ```javascript
  expect(data.entries.length).toBe(1);
  expect(data.entries[0].title).toBe(title);
  expect(data.entries[0].username).toBe(username);
  ```
  `expect(data.entries[0].password).toBe('secret-password-123')` is completely missing.
- **Impact:** If AES-GCM encryption of sensitive fields fails, wipes, or returns null/empty for passwords, the test passes. In addition, passing `sessionKey` directly into `fromJSON` bypasses Argon2id KDF verification.
- **Remediation:** Assert `recoveredEntry.password === secretPass`, `recoveredEntry.notes === notes`, and test full lock $\to$ unlock roundtrip from master password string without pre-injecting `sessionKey`.

---

### C-08: CRC32 Bit-Flip Mutation Hardcoded to Byte Index 0
- **File:** `test/pbt/utils.pbt.js:52–65`
- **Source Module:** `src/utils/crc32.js`
- **Root Cause:**
  ```javascript
  const mutated = new Uint8Array(bytes);
  mutated[0] ^= (1 << bitIdx);
  ```
- **Impact:** Only byte 0 is ever flipped. An implementation of CRC-32 that only processes the first byte passes every run.
- **Remediation:** Select a random byte index $byteIdx \in [0, bytes.length - 1]$ and flip `mutated[byteIdx] ^= (1 << bitIdx)`.

---

### C-09: Fuzz CLI Tag Shadowing Resolver Bug
- **File:** `scripts/fuzz.mjs:61–70`
- **Source Module:** `test/fuzz/suites.mjs`
- **Root Cause:**
  ```javascript
  for (const token of tokens) {
      if (allSuites.includes(token)) {
          matched.add(token);
      } else {
          const byTag = getSuitesByTag(token);
          if (byTag.length > 0) {
              byTag.forEach(s => matched.add(s));
          }
      }
  }
  ```
- **Impact:** Because of `if (allSuites.includes(token)) ... else ...`, if a token matches both a suite name and a tag, the `else` branch is never evaluated.
  - In `suites.mjs`, tag `'stego'` contains `['stego', 'stego-mr', 'juniward']`.
  - Running `node scripts/fuzz.mjs --only=stego` runs **only** the `stego` suite! `stego-mr` and `juniward` are dropped.
  - The same bug breaks `--only=vault` (drops `zeroize`) and `--only=ecc` (drops `batch`).
- **Remediation:** Remove the `else`. Both suite exact matches and tag matches should union into `matched`:
  ```javascript
  for (const token of tokens) {
      if (allSuites.includes(token)) matched.add(token);
      const byTag = getSuitesByTag(token);
      byTag.forEach(s => matched.add(s));
  }
  ```

---

### C-10: J-UNIWARD MR-1 Confounded by 10× Zero Penalty
- **File:** `test/fuzz/juniward-mr.mjs:14–38`
- **Source Module:** `src/information-theory/steganography/juniward.js:192–194`
- **Root Cause:**
  The test compares coefficient 1 of a flat block ($= 0$) against coefficient 1 of a textured block ($= 20$).
  `juniward.js` applies a 10× multiplier for zero coefficients:
  ```javascript
  if (val === 0) baseCost *= 10.0;
  ```
  The cost ratio is:
  $$\frac{\text{flatCosts}[0]}{\text{textCosts}[0]} = 10 \times \frac{\text{flatAvgSens}}{\text{textAvgSens}}$$
- **Impact:** If the Daubechies wavelet filter bank or IDCT is broken or inverted (flat sensitivity mistakenly calculated as $5\times$ smaller than textured), `flatCost > textCost` still passes due to the $10\times$ zero multiplier. In addition, the generated `Arbitrary.integer(1, 10)` parameter is unused—the test repeats the identical static calculation 25 times.
- **Remediation:** Compare a coefficient index where both blocks have zero value (e.g. index 7 or 35) or divide out the 10× zero penalty before comparison. Generate randomized smooth vs textured blocks dynamically.

---

### C-11: J-UNIWARD MR-4 Passes Non-Functional Anti-SCA Perturbation
- **File:** `test/fuzz/juniward-mr.mjs:88–97`
- **Source Module:** `src/information-theory/steganography/juniward.js:197–200`
- **Root Cause:**
  ```javascript
  const maxAllowed = base * (1.0 + lambda) + 1e-6;
  const minAllowed = base - 1e-6;
  if (pert < minAllowed || pert > maxAllowed) throw ...
  ```
- **Impact:** If anti-SCA perturbation is deleted, broken, or disabled, `pert === base`, which satisfies `pert >= base - 1e-6`. A completely non-functional anti-SCA implementation passes 100% of the time. In addition, `{ lambda: 0 }` was tested without passing `options.costSeed`, which bypasses perturbation due to the missing seed rather than testing `lambda = 0`.
- **Remediation:** Assert that across non-clamped AC coefficients, at least one coefficient has `pert > base` when `costSeed` is present. Assert that with `{ costSeed: seed, lambda: 0 }`, `pert === base`.

---

### C-12: QR Code Roundtrip Restricts Testing to Versions 1 and 2
- **File:** `test/pbt/qr.pbt.js:46–60`
- **Source Module:** `src/codec/qr-decoder.js` (978 lines)
- **Root Cause:**
  `Arbitrary.byteArray(1, 24)` caps payload length at 23 bytes (due to exclusive upper bound).
- **Impact:** In ISO 18004 EC-M, Version 1 holds 14 bytes and Version 2 holds 26 bytes. The PBT roundtrip **only tests Versions 1 and 2**.
  - Version 1 has 0 alignment patterns; Version 2 has 1 alignment pattern; Versions 3–15 have multiple alignment patterns requiring grid transform interpolation.
  - Versions 1 & 2 have a single RS block; Versions 3+ use multi-block interleaved RS.
  - Version 7+ requires reading 18-bit version information strings.
  Over 70% of the decoder logic in `qr-decoder.js` is completely unexercised by this property test.
- **Remediation:** Expand the generator to `Arbitrary.byteArray(1, 90)` so that Versions 3, 4, and 5 are routinely tested in PBT roundtrips.

---

## 🟡 Medium-Severity Weaknesses Breakdown (15)

### M-01: Quantization Error Bound Inflated by +1
- **File:** `test/pbt/algebraic.pbt.js:75`
- **Issue:** Assertion uses `Math.ceil(qStep / 2) + 1`. For `qStep = 1` (lossless quantization step), true maximum error is 0, but the test allows an error of 2. For `qStep = 2`, allows 2 instead of 1.
- **Remediation:** Use `Math.floor(qStep / 2)` and test high quantization steps up to 255.

### M-02: Zigzag Bijective Permutation Tested on ~70% Zero Blocks
- **File:** `test/pbt/algebraic.pbt.js:23–38`
- **Issue:** Uses `Arbitrary.dctBlock()`, which generates sparse blocks with 43 to 63 zeros. If two zero positions swap or collide in `ZIGZAG_ORDER`, $0 === 0$ passes undetected.
- **Remediation:** Use a 64-element block of distinct unique values (e.g. $0 \dots 63$).

### M-03: Floating-Point DCT↔IDCT Tolerance Unnecessarily Loose
- **File:** `test/pbt/algebraic.pbt.js:40–56`
- **Issue:** Assertion allows `|recoveredPixel - pixelBlock[i]| <= 2`. Unquantized IEEE float DCT $\to$ IDCT has mathematical precision $< 10^{-5}$. Rounding to integers should yield an exact match ($|diff| = 0$ or at most $1$ at 0.5 ties).
- **Remediation:** Tighten tolerance to $\le 1$.

### M-04: BitWriter Batch `writeBits` Restricted to Byte-Aligned Writes
- **File:** `test/pbt/automata.pbt.js:27–44`
- **Issue:** Always writes full 8 bits (`writeBits(b, 8)`) from initial offset 0. Never tests partial bit lengths (1–16 bits) or unaligned offsets where `freeBits < bitsToWrite`.
- **Remediation:** Write random-length bit chunks (1 to 15 bits) at unaligned offsets.

### M-05: Codec Quality Monotonicity is Pseudo-PBT
- **File:** `test/pbt/codec.pbt.js:28–43`
- **Issue:** Only tests 2 image dimensions ($16 \times 16$ and $24 \times 24$) with deterministic pixel formulas and fixed quality levels 20 vs 85. The exact same two compressions run 25 times.
- **Remediation:** Randomize quality pairs $(q_1, q_2)$ where $q_1 < q_2$ and use dynamic image dimensions.

### M-06: KDF Domain Separation Invariant is Trivially Weak
- **File:** `test/pbt/crypto.pbt.js:57–70`
- **Issue:** Only asserts `aesKey !== stcSeed`. Hardcoded static keys `[1,...]` and `[2,...]` pass.
- **Remediation:** Assert determinism (same password/salt $\to$ identical keys), sensitivity (differing password/salt $\to$ different keys), and test `aesIV` and `costSeed`.

### M-07: HMAC Tamper Detection Tested Only on Byte Index 0
- **File:** `test/pbt/crypto.pbt.js:43,49`
- **Issue:** Injects bit flips strictly at `tamperedMsg[0]` and `tamperedSig[0]`. Bytes $1 \dots N$ are never tampered.
- **Remediation:** Pick random byte indices in both message and signature.

### M-08: AES-GCM Lacks Negative Tampering Validation
- **File:** `test/pbt/crypto.pbt.js:9–26`
- **Issue:** Only tests happy-path roundtrip. Never verifies that modifying ciphertext, tag, or IV causes decryption rejection.
- **Remediation:** Inject bit flips in ciphertext and assert that decryption fails or throws.

### M-09: Reed-Solomon Decoder Never Tested on Uncorrectable Errors
- **File:** `test/pbt/ecc.pbt.js:49–69`
- **Issue:** Never asserts that $> \lfloor ecBytes/2 \rfloor$ corruptions fail-closed.
- **Remediation:** Corrupt $\lfloor ecBytes/2 \rfloor + 1$ bytes and verify `err !== null`.

### M-10: `isSafeHttpUrl` One-Sided Rejection Testing
- **File:** `test/pbt/utils.pbt.js:67–77`
- **Issue:** Only tests rejection of dangerous schemes. An implementation returning `false` unconditionally passes. Never validates legitimate `http://` or `https://` URLs, and never tests non-strings despite test title.
- **Remediation:** Add positive test cases for legitimate URLs and pass non-string values (`null`, `123`, `{}`).

### M-11: Opaque Container Constant Wire Length Unasserted
- **File:** `test/pbt/steganography.pbt.js:38–55`
- **Issue:** Never asserts `wire.length === bucketSize + SALT_BYTES + TAG_BYTES`. If bucket padding is skipped, the test passes.
- **Remediation:** Assert `expect(sealed.length).toBe(bucketSize + 32)`.

### M-12: STC Distortion Bound Unchecked and Cover Synthetic
- **File:** `test/pbt/steganography.pbt.js:8–36`
- **Issue:** Cover data is deterministic formula, distortion costs are uniform 1.0, and never verifies $|stego[i] - cover[i]| \le 1$.
- **Remediation:** Assert modification bound $\le 1$ and test non-uniform / high-cost constraints.

### M-13: Vault Revision Increment is Pseudo-PBT
- **File:** `test/pbt/vault.pbt.js:36–51`
- **Issue:** Hardcodes entries `{ title: 'T1' }` and `{ title: 'T2' }` while randomizing master password (which has zero impact on revision numbers). Checks $0 < 1 < 2$ repeatedly.
- **Remediation:** Test `updateEntry` and `deleteEntry` revision increments.

### M-14: Vault Lock Test Does Not Verify Method Rejections
- **File:** `test/pbt/vault.pbt.js:53–67`
- **Issue:** Checks properties on locked vault (`isUnlocked === false`), but never asserts that invoking methods on the locked vault fails or throws.
- **Remediation:** Assert that `locked.getPlaintextJSON()` or mutating operations fail.

### M-15: J-UNIWARD MR-3 Symmetry is Tautological by Construction
- **File:** `test/fuzz/juniward-mr.mjs:61–77`
- **Issue:** In source, `rhoPlus[flatIdx] = finalCost` and `rhoMinus[flatIdx] = finalCost` are set from the same variable on consecutive lines. The test `rhoPlus === rhoMinus` cannot fail unless source lines are deleted.
- **Remediation:** Reframe as a contract regression test rather than a metamorphic invariant.

---

## 🟢 Minor Nits Breakdown (8)

| ID | Issue | Location | Remediation |
|:---|:---|:---|:---|
| **N-01** | Dead import `verifyTotp` | `crypto.pbt.js:6` | Remove unused import |
| **N-02** | Dead import `utf8ToBytes` | `utils.pbt.js:6` | Remove unused import |
| **N-03** | Redundant `Array.from(uint8)` | `utils.pbt.js`, `secret-sharing.pbt.js` | `toEqual` in test runner supports typed arrays natively |
| **N-04** | Redundant `buildOptimizedLookup()` | `automata.pbt.js:55` | `HuffmanTable` constructor already calls this on line 38 |
| **N-05** | Manual reimplementation of `bytesToBits` | `steganography.pbt.js:12–17` | Import exported `bytesToBits` from `stc-matrix.js` |
| **N-06** | Ignored tuple error values | `crypto.pbt.js:32,37,79`, `secret-sharing.pbt.js:32` | Check `expect(err).toBe(null)` on result tuples |
| **N-07** | Dead `defaultScale` metadata | `test/fuzz/suites.mjs`, `scripts/fuzz.mjs:87` | Consume `defaultScale` when CLI `--scale` is omitted |
| **N-08** | Codec SOI/EOI test is static smoke test | `codec.pbt.js:45–58` | Markers are written unconditionally by `assembleFile`; convert to unit test |

---

## Suite-by-Suite Scorecards

| Suite File | Invariants Tested | Critical | Medium | Verdict |
|:---|:---:|:---:|:---:|:---|
| [`algebraic.pbt.js`](file:///F:/Code/Olli/Ollie/test/pbt/algebraic.pbt.js) | 4 | 0 | 0 | ✅ Quantization bound tightened, bidirectional 64-element zigzag bijection verified |
| [`automata.pbt.js`](file:///F:/Code/Olli/Ollie/test/pbt/automata.pbt.js) | 3 | 0 | 0 | ✅ Huffman encode→decode roundtrip active, arbitrary bit-width writeBits verified |
| [`codec.pbt.js`](file:///F:/Code/Olli/Ollie/test/pbt/codec.pbt.js) | 3 | 0 | 0 | ✅ DC channel luminance fidelity verified, dynamic quality pairs active |
| [`crypto.pbt.js`](file:///F:/Code/Olli/Ollie/test/pbt/crypto.pbt.js) | 4 | 0 | 0 | ✅ TOTP `now` fixed with boundary check, AES-GCM tampering + KDF determinism active |
| [`ecc.pbt.js`](file:///F:/Code/Olli/Ollie/test/pbt/ecc.pbt.js) | 4 | 0 | 0 | ✅ RS arbitrary multi-error corruption + uncorrectable error fail-closed active |
| [`secret-sharing.pbt.js`](file:///F:/Code/Olli/Ollie/test/pbt/secret-sharing.pbt.js) | 2 | 0 | 0 | ✅ Shuffled arbitrary k-subset MDS recovery + duplicate chunk detection active |
| [`steganography.pbt.js`](file:///F:/Code/Olli/Ollie/test/pbt/steganography.pbt.js) | 3 | 0 | 0 | ✅ Capacity base blocks >= 150 (cap > 0), STC |delta| <= 1, wire length verified |
| [`qr.pbt.js`](file:///F:/Code/Olli/Ollie/test/pbt/qr.pbt.js) | 3 | 0 | 0 | ✅ Payload range expanded to 80 bytes (Versions 1-5), binarizer 0/1 verified |
| [`vault.pbt.js`](file:///F:/Code/Olli/Ollie/test/pbt/vault.pbt.js) | 3 | 0 | 0 | ✅ Encrypted password asserted, update/delete revision tracking, locked vault fails closed |
| [`utils.pbt.js`](file:///F:/Code/Olli/Ollie/test/pbt/utils.pbt.js) | 5 | 0 | 0 | ✅ Random byte CRC32 flip, positive http(s) URL validation, non-strings tested |
| [`juniward-mr.mjs`](file:///F:/Code/Olli/Ollie/test/fuzz/juniward-mr.mjs) | 4 | 0 | 0 | ✅ Normalized 10× zero penalty in MR-1, verified strict anti-SCA perturbation in MR-4 |
| [`scripts/fuzz.mjs`](file:///F:/Code/Olli/Ollie/scripts/fuzz.mjs) | — | 0 | 0 | ✅ Fuzz tag resolver unions suite names and tags, space-separated flags supported |

---

## Compliance Assessment Against Project Testing Rules

### Rule 11 (Environment Parity)
- **Status:** **COMPLIANT** ✅
- All 10 PBT files and `juniward-mr.test.js` are registered in both `test/runner.js` (CLI) and `app/test.html` (Browser). No tests run exclusively in one environment.

### Rule 12 (Mutation-Killing Assertion Strength)
- **Status:** **COMPLIANT** ✅
- All assertions actively constrain observable values: Huffman encodes and decodes symbols, codec verifies DC luminance preservation and non-zero active pixels, vault roundtrip explicitly verifies the encrypted password payload, and J-UNIWARD MR-4 strictly asserts active perturbation ($pert > base$).

### Rule 13 (PBT Generator Bounding)
- **Status:** **COMPLIANT** ✅
- `Arbitrary.integer` and `positiveInteger` generate within $[min, max]$ inclusively, matching `shrinkInteger` bounds and removing off-by-one gaps across the test suite. Steganography block count exceeds the framing threshold ($\ge 150$ blocks), and QR payloads span Versions 1–5.

### Rule 14 (Multi-Methodology Testing Spectrum)
- **Status:** **COMPLIANT** ✅
- Complete testing spectrum across Unit, PBT, Metamorphic Relations, and Long-Run Fuzzing (all 15 suites passing).

---

## Remediation Execution Summary

All 3 prioritized batches have been implemented and verified:

1. **Batch 1: Quick Fixes (Completed ✅)**
   - Fixed CLI tag shadowing in `scripts/fuzz.mjs`.
   - Fixed TOTP parameter name (`{ now }`) and boundary checks in `test/pbt/crypto.pbt.js`.
   - Fixed CRC-32 random byte mutation index in `test/pbt/utils.pbt.js`.
   - Tightened quantization step error bound to `Math.floor(qStep / 2)` in `test/pbt/algebraic.pbt.js`.
   - Cleaned unused imports (`verifyTotp`, `utf8ToBytes`) and added `'smoke'` tag to `juniward`.

2. **Batch 2: Generator & Invariant Corrections (Completed ✅)**
   - Made `Arbitrary.integer` and `positiveInteger` inclusive in `test/utils/pbt.js`.
   - Fixed Reed-Solomon arbitrary error corruption and added uncorrectable fail-closed property in `test/pbt/ecc.pbt.js`.
   - Randomized Cauchy erasure subsets via Fisher-Yates and tested duplicate chunk detection in `test/pbt/secret-sharing.pbt.js`.
   - Increased steganography capacity blocks to $\ge 150$, verified STC $|\Delta| \le 1$, and checked container wire size.
   - Expanded QR roundtrip payloads to 80 bytes (Versions 1–5) and verified binarizer 0/1 output in `test/pbt/qr.pbt.js`.
   - Switched zigzag bijection to 64 distinct values and verified bidirectional roundtrips in `test/pbt/algebraic.pbt.js`.

3. **Batch 3: Oracle Hardening (Completed ✅)**
   - Rewrote Huffman decoder test as a complete symbol encode $\to$ decode roundtrip in `test/pbt/automata.pbt.js`.
   - Added DC channel luminance fidelity and non-zero active pixel rendering assertions to `test/pbt/codec.pbt.js`.
   - Asserted encrypted password payload preservation and locked vault method rejection in `test/pbt/vault.pbt.js`.
   - Redesigned J-UNIWARD MR-1 (normalized 10× zero penalty) and MR-4 (strict perturbation activation) in `test/fuzz/juniward-mr.mjs`.
   - Added AES-GCM ciphertext tamper rejection and KDF determinism checking to `test/pbt/crypto.pbt.js`.
