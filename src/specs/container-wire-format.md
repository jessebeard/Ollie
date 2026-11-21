# Ollie Container Wire Format — Reference Specification (v4.1)

**Status:** Current Reference Specification (Format v4.1 with Decoupled Stego/Envelope Keys, Carrier-Invariant DC Nonce, Binary Slice Framing, and Deflate Expansion Immunity).
**Normative Implementation:**
- `src/information-theory/steganography/carrier-salt.js` (Canonical 24-byte prefix DC nonce derivation)
- `src/information-theory/steganography/stego-payload.js` (Binary slice framing version 41 & strong parser)
- `src/information-theory/steganography/stego-engine.js` (STC + J-UNIWARD orchestrator)
- `src/information-theory/steganography/opaque-container.js` (Bit-31 Deflate bypass & opaque bucket framing)
- `src/information-theory/steganography/stc-matrix.js` (Syndrome-Trellis Coding & submatrix generation)
- `src/information-theory/steganography/juniward.js` (Directional spatial wavelet distortion & detailed balance)
- `src/information-theory/cryptography/kdf-chain.js` (Argon2id + RFC 5869 HKDF decoupled key derivation)
- `src/information-theory/secret-sharing/cauchy-ec.js` (Cauchy MDS parity allocation & quorum invariant)

**Test Suites:**
- `test/information-theory/steganography/carrier-salt.test.js`
- `test/information-theory/steganography/stego-payload-v41.test.js`
- `test/information-theory/steganography/opaque-container-expansion.test.js`
- `test/information-theory/secret-sharing/cauchy-ec-invariant.test.js`
- `test/information-theory/steganography/histogram-balance.test.js`
- `test/pbt/stego-payload-v41.pbt.js`
- `test/fuzz/stego-payload-fuzz.test.js`
- `test/conformance/wire-format-conformance.test.js`
- `test/conformance/wire-format.pbt.js`

All multi-byte integers are BIG-ENDIAN unless explicitly stated otherwise.
All byte counts are decimal. "MUST" / "MUST NOT" / "SHOULD" are normative.

---

## 0. Architectural Principles & Security Goals (Format v4)

Format v4 establishes four foundational security guarantees against passive eavesdropping, active tampering, and statistical steganalysis:

1. **Zero Plaintext Metadata:** No unencrypted headers, magic bytes, length counters, KDF iterations, or salt metadata are ever stored in the carrier in plaintext.
2. **Zero Length Disclosures:** Ciphertexts are padded to discrete power-of-two buckets ($256, 512, 1024, 2048, 4096, \dots$ bytes) using cryptographically secure pseudorandom padding (`crypto.getRandomValues`). The carrier reveals zero information about total payload or document size.
3. **Unified Argon2id Key Derivation Chain:** All subkeys and embedding parameters (AES-256-GCM key, IV, STC parity matrix seed, and J-UNIWARD distortion cost seed) are derived via a single unified Argon2id + HKDF-Expand (RFC 5869) key derivation chain.
4. **Adaptive J-UNIWARD Steganography + Linear-Time Syndrome-Trellis Codes (STC):** Eliminates legacy F5 shrinkage and permutation vulnerabilities by embedding along the rate-distortion bound using spatial Daubechies 8-tap (db8) directional wavelets, anti-SCA key randomization, and $O(M)$ bounded Viterbi dual-trellis syndrome encoding.

---

## 1. Layering Overview

A vault travels through six framing layers:

```
  Layer 6  Vault document / export envelope      (JSON, application layer)
  Layer 5  Multi-carrier threshold chunking      (Cauchy MDS erasure coding + GF(256) Shamir shares)
  Layer 4  Framed Opaque Container Payload       (Deflate / Invalidate + CRC-32 + 2B Length)
  Layer 3  Opaque Encrypted Envelope             (AES-256-GCM + CSPRNG Bucket Padding)
  Layer 2  Argon2id + HKDF Key Derivation Chain  (Domain separation for AES, STC, J-UNIWARD)
  Layer 1  STC Trellis Encoding + J-UNIWARD      (Dual-trellis Viterbi minimization over AC coefficients)
  Layer 0  Carrier Mapping                       (JPEG quantized DCT blocks -> Flat AC index space)
```

---

## 2. Layer 0 — Carrier Mapping

The carrier is a baseline or progressive JPEG entropy-decoded to quantized DCT blocks.

### 2.1 Block Collection
Blocks are collected per component in frame-header component order (SOF component ID order). The canonical order is $Y$, then $Cb$, then $Cr$ (`JpegEncoder.flattenBlocks`).

### 2.2 Flat AC Index Space
Each $8 \times 8$ block contributes exactly 63 usable slots: AC coefficients $1 \dots 63$. DC coefficient 0 is NEVER modified to preserve baseline luminance.
The flat AC index space has total size $N = \text{blockCount} \times 63$, where:

$$\text{flatIndex } i \implies \text{block } \lfloor i / 63 \rfloor, \quad \text{coeff } (i \bmod 63) + 1$$

---

## 3. Layer 1 — Steganography Engine (J-UNIWARD + STC)

Format v4 replaces matrix-encoding permutations and F5 shrinkage with **J-UNIWARD spatial distortion modeling** combined with **Syndrome-Trellis Codes (STC)**.

### 3.1 J-UNIWARD Spatial Wavelet Distortion Model
For each $8 \times 8$ quantized DCT block $\mathbf{D}$:
1. **Dequantization:** $\mathbf{C}(u, v) = \mathbf{D}(u, v) \times \mathbf{Q}(u, v)$.
2. **Spatial IDCT:** $\mathbf{I} = \text{IDCT2D}(\mathbf{C})$.
3. **Directional Wavelet Filter Bank:** $\mathbf{I}$ is filtered across 3 directional subbands using 8-tap Daubechies (db8) filters $H$ (low-pass) and $G$ (high-pass):
   - Horizontal: $\mathbf{W}_1 = H \ast_x G \ast_y \mathbf{I}$
   - Vertical: $\mathbf{W}_2 = G \ast_x H \ast_y \mathbf{I}$
   - Diagonal: $\mathbf{W}_3 = G \ast_x G \ast_y \mathbf{I}$
4. **Spatial Sensitivity Map:**
   $$\xi(r, c) = \sum_{k=1}^{3} \frac{1}{|\mathbf{W}_k(r, c)| + \sigma}, \quad \text{where } \sigma = 2^{-6} = 0.015625$$
5. **AC Distortion Costs:** For AC coefficient $i \in [1, 63]$:
   $$\rho_i = \max\left(0.01, \; \frac{\mathbf{Q}(i) \cdot \overline{\xi}}{100} \times \left(1 + \lambda \cdot u_i\right) \times \begin{cases} 1.5 & \text{if } \mathbf{D}(i) = 0 \\ 1.0 & \text{otherwise} \end{cases}\right)$$
   where $u_i \sim \mathcal{U}[0, 1)$ is derived from `costSeed` for Anti-Selection-Channel-Awareness (Anti-SCA), and $\lambda = 0.3$.

### 3.2 Syndrome-Trellis Codes (STC) Dual-Trellis Encoding
Embedding a message $\mathbf{m} \in \{0, 1\}^M$ into AC cover coefficients $\mathbf{x} \in \mathbb{Z}^N$:
- Constraint height $h = 8$ ($2^8 = 256$ trellis states).
- Submatrix width $w = \text{calculateSTCWidth}(N, M, \text{options})$ dynamically scales up to $w \le 16$ for small/medium payloads while bounding trellis transitions strictly below 256 MB memory ($w \le 4$ for 128 KB payloads).
- Parity-check submatrix $\hat{\mathbf{h}} \in \mathbb{F}_2^{h \times w}$ is deterministically generated from `stcSeed`.
- **Keyed Cycle-Walking Feistel Permutation:** To eliminate spatial clustering and periodic spectral combs (cyclostationary signatures detected by DCTR/GFR/SRM), cover elements are sampled via a zero-allocation, 8-round keyed cycle-walking Feistel permutation:
  $$i_t = \pi_{\text{seed}, N}(t) \quad \text{for } t = 0, \dots, M \cdot w - 1$$
  This mathematically guarantees an exact collision-free bijection over $\{0, \dots, N-1\}$ with high-entropy aperiodic step deltas, full key-width SAC avalanche, and zero heap memory ($0$ bytes allocated).
- **Algebraic Predecessor Recovery:** Viterbi dynamic programming determines optimal modification sequence $\mathbf{y} \in \{\mathbf{x}-1, \mathbf{x}, \mathbf{x}+1\}^N$ minimizing $\sum \rho_i |\mathbf{y}_i - \mathbf{x}_i|$ subject to $\mathbf{H}\mathbf{y} = \mathbf{m} \pmod 2$. During traceback, because XOR is self-inverting over $\mathbb{F}_2$, predecessor state is computed algebraically without storing a predecessor state matrix:
  $$s_{\text{prev}} = s_{\text{next}} \oplus (\text{chosenParity} \cdot \hat{\mathbf{h}}_j)$$
  This completely eliminates the 8.59 GB `prevStates` (`Uint16Array`) allocation.
- **2-Bit Packed Decision Matrix:** Transition decisions ($0 = \text{no change}, 1 = +1, 2 = -1$) are packed 4 decisions per byte in a `Uint8Array`, bounding decision storage to $\le 268\text{ MB}$ even at the 128 KB bucket limit.
- **StegoEngine Safety Ceiling:** Payloads are hard-capped at $\text{MAX\_STEGO\_PAYLOAD\_BYTES} = 131072$ (128 KB). Any payload exceeding 128 KB fails closed with an explicit error before any trellis allocation.
- Extracting bits from stego sequence $\mathbf{y}$ is linear time $O(M \cdot w)$:
  $$\mathbf{m}_k = \bigoplus_{j=0}^{w-1} \left(|\mathbf{y}_{\pi(k \cdot w + j)}| \bmod 2\right) \cdot \hat{\mathbf{h}}_j \pmod 2$$

---

## 4. Layer 2 — Format v4.1 Decoupled Key Derivation Chain

All cryptographic and steganographic keys are derived from the user password via decoupled carrier-bound and envelope-bound domain separation:

```
                      Password + Carrier Salt (32B Canonical DC Nonce)
                                           |
                                           v
                                 Argon2id (RFC 9106)
                             t=3, m=64MB, p=1, keyLen=32B
                                           |
                                           v
                                       Master Key
                                           |
                 +-------------------------+-------------------------+
                 |                                                   |
                 v                                                   v
            HKDF-Expand                                         HKDF-Extract
     ("ollie/v4.1/stc-matrix", 32)                         (Envelope Salt: 16B CSPRNG,
     ("ollie/v4.1/cost-seed", 32)                                  Master Key)
                 |                                                   |
                 v                                                   v
        Stego Seeding Suite                                      prk_env
        stcSeed, costSeed                                            |
                                                    +----------------+----------------+
                                                    |                                 |
                                                    v                                 v
                                               HKDF-Expand                       HKDF-Expand
                                       ("ollie/v4.1/aes-key", 32)        ("ollie/v4.1/aes-iv", 12)
                                                    |                                 |
                                                    v                                 v
                                               AES-256 Key                       AES-256 IV
```

### 4.1 Carrier Salt (`carrierSalt`) Derivation
The carrier salt is derived deterministically from the carrier's canonical DC coefficients and quantization tables:
$$\text{carrierSalt} = \text{SHA-256}\left(\text{"ollie/v4.1/carrier-salt/"} \parallel C \parallel \text{canonical}(Q) \parallel \text{canonical}(DC)\right)$$
- Prefix: Exact 24 ASCII bytes (`"ollie/v4.1/carrier-salt/"`).
- Big-Endian `DataView` serializes component count $C \in \{1, 3\}$, quantization tables ($C \times 128$ bytes), and all DC coefficients ($\text{blockCount} \times 2$ bytes).
- Invariant across embedding: because DC coefficients and quantization tables are never modified during steganographic embedding, the cover and stego carrier yield identical `carrierSalt`.
- Eliminates fast offline password cracking: an attacker cannot evaluate STC parity checks without evaluating Argon2id over `carrierSalt`.

### 4.2 Decoupled Envelope Encryption
To guarantee **Zero AES-GCM Nonce Reuse** even when re-embedding into the same carrier:
- Every embedding generates a fresh 16-byte CSPRNG `envelopeSalt`.
- Per-encryption keys extract from `envelopeSalt` and `masterKey`:
  $$\text{prk\_env} = \text{HKDF-Extract}(\text{envelopeSalt}, \text{masterKey})$$
  $$\text{aesKey} = \text{HKDF-Expand}(\text{prk\_env}, \text{"ollie/v4.1/aes-key"}, 32)$$
  $$\text{aesIV} = \text{HKDF-Expand}(\text{prk\_env}, \text{"ollie/v4.1/aes-iv"}, 12)$$

---

## 5. Layer 3 & 4 — Opaque Framing & Incompressible Deflate Bypass

### 5.1 Bit-31 Compression Flag
To prevent high-entropy compressed stripes from spilling into larger bucket boundaries via Deflate 5-byte stored header expansion:
- Bit 31 of the 4-byte length header in `opaque-container.js` indicates compression status (`0x80000000`).
- If Deflate output length $\ge$ raw payload length, the payload is stored raw with Bit 31 clear ($0$).
- If Deflate output length $<$ raw payload length, compressed bytes are stored with Bit 31 set ($1$).
- Bits 0–30 store the exact stored byte length.

### 5.2 Format v4.1 Stego-Payload Binary Slice Framing & Positional Array Metadata (Rule 16)
Individual carrier chunk data is serialized using a zero-overhead binary slice frame, strictly avoiding Base64 and labeled JSON dictionary objects:

```
Offset  Length  Field           Type            Description
--------------------------------------------------------------------------------
0       1       version         uint8           Format version (constant 41)
1       4       carrierChecksum uint32 BE       IEEE 802.3 CRC-32 of rawChunkBytes
5       2       metaLen (M)     uint16 BE       Byte length of metadata JSON string
7       M       metaBytes       UTF-8 bytes     JSON tuple [chunkTuple, manifestTuple, filename]
7+M     R       rawChunkBytes   bytes           Raw binary ciphertext stripe (zero-copy)
```

#### 5.2.1 Positional Tuples (No Labeled JSON Objects)
Formats outside the raw stego payload (manifests, chunk metadata, records) must be serialized as compact positional arrays (tuples) rather than labeled string-keyed JSON dictionary objects:
- **Chunk Tuple (`chunkTuple`)**: `[id, index, total, count, stripeSize, startIndex]`
- **Manifest Tuple (`manifestTuple`)**:
  ```
  [
    0: format ('ollie-manifest'),
    1: version (1),
    2: chunkSetId (UUID),
    3: total (uint32),
    4: revision (uint32),
    5: created (ISO timestamp / numeric),
    6: entries ([[index, checksum], ...]),
    7: kdf ([algo, iterations, salt] or null),
    8: ec ([k, n, size] or null),
    9: shares ([[index, threshold, data], ...] or null),
    10: mac (HMAC-SHA256 base64 string or null)
  ]
  ```
All unpackers must fail closed with explicit validation of tuple length, primitive types, and bounds.

### 5.2.2 Vault Export Envelope Positional Wire Tuple (Rule 16)
Standalone encrypted vault export containers (`.ollie` / `exportEncrypted()`) serialize as a 4-element positional array tuple:
```json
[
  "ollie-export",
  2,
  ["PBKDF2-SHA256", 600000, "<salt-b64>", "<iv-b64>"],
  "<ciphertext-b64>"
]
```
Schema indices:
* `0: format` (`string`, strictly `"ollie-export"`)
* `1: version` (`integer`, strictly `2` for tuple; legacy version `1` dictionary supported backward-compatibly)
* `2: kdf` (`[algo, iterations, salt, iv]` tuple)
* `3: ciphertext` (`string`, base64-encoded AES-256-GCM ciphertext + 16-byte tag)

All unpackers (`unpackExportEnvelope`) fail closed on length mismatch, missing indices, or corrupted ciphertext.

---

## 6. Layer 5 — Multi-Carrier Threshold & Cauchy MDS Invariant

When splitting a vault across $n$ photo carriers with threshold $k$:
1. The vault document is erasure-coded using **Cauchy MDS Reed-Solomon Parity Coding** over $\text{GF}(256)$.
2. **Cauchy MDS Quorum Invariant:** In proportional parity allocation, block counts $c_i$ for carriers sorted in ascending capacity order MUST satisfy:
   $$\sum_{i=1}^k c_{(i)} \ge K_{\text{MDS}}$$
   Any subset of $k$ carriers (including the $k$ smallest carriers) is guaranteed to supply at least $K_{\text{MDS}}$ chunks for complete vault reconstruction.
3. Carrier usable capacities are clamped to `DEFAULT_MAX_CARRIER_BYTES = 65536` (64 KB) with `maxSharePerCarrier = 0.4`.

---

## 7. Test Conformance Vectors

All implementations MUST conform to the formal property-based test suites in `test/conformance/wire-format-conformance.test.js`, `test/conformance/wire-format.pbt.js`, `test/information-theory/steganography/stego-payload-v41.test.js`, and `test/information-theory/secret-sharing/cauchy-ec-invariant.test.js`.
