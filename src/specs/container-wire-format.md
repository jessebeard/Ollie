# Ollie Container Wire Format — Reference Specification (v4)

**Status:** Current Reference Specification.
**Normative Implementation:** `src/information-theory/steganography/stego-engine.js`, `src/information-theory/steganography/opaque-container.js`, `src/information-theory/steganography/stc-matrix.js`, `src/information-theory/steganography/juniward.js`, `src/information-theory/cryptography/kdf-chain.js`.
**Test Suites:** `test/conformance/wire-format-conformance.test.js`, `test/conformance/wire-format.pbt.js`.

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

## 4. Layer 2 — Argon2id + HKDF Key Derivation Chain

All cryptographic and steganographic keys are derived from the user password via unified domain separation:

```
                      Password + Salt (16B CSPRNG)
                                   |
                                   v
                         Argon2id (RFC 9106)
                     t=3, m=64MB, p=1, keyLen=32B
                                   |
                                   v
                             Master Secret
                                   |
                +------------------+------------------+
                |                                     |
                v                                     v
          HKDF-Extract                          SHA-256 Digest
                |                                     |
       +--------+--------+                            v
       |                 |                   Deterministic STC Seed
       v                 v                 ("ollie/v4/stc-matrix/", pw)
   AES-256 Key       AES-256 IV
   ("aes-key")       ("aes-iv")
```

### 4.1 Argon2id Parameters
- Algorithm: Argon2id (RFC 9106, vendored OpenPGP.js WASM engine)
- Time cost: $t = 3$ iterations
- Memory cost: $m = 65,536\text{ KiB}$ ($64\text{ MB}$)
- Parallelism: $p = 1$ (single-threaded browser/Node compatibility)
- Output Key Length: 32 bytes

### 4.2 HKDF-Expand Domain Separation (RFC 5869)
- `aesKey` (32 bytes): `HKDF-Expand(masterSecret, "ollie/v4/aes-key", 32)`
- `aesIV` (12 bytes): `HKDF-Expand(masterSecret, "ollie/v4/aes-iv", 12)`
- `costSeed` (32 bytes): `HKDF-Expand(masterSecret, "ollie/v4/cost-seed", 32)`
- `stcSeed` (32 bytes): Derived as `SHA-256("ollie/v4/stc-matrix/" || UTF8(password))` to allow linear syndrome extraction prior to salt unmasking.

---

## 5. Layer 3 & 4 — Opaque Framing & Encrypted Container

Format v4 seals payloads into zero-length opaque frames with CSPRNG bucket padding.

### 5.1 Framed Payload Structure
Prior to encryption, the payload is framed with a 7-byte control header:

```
Offset  Length  Field           Type            Description
--------------------------------------------------------------------------------
0       2       Length (L)      uint16 BE       Byte length of uncompressed payload
2       1       Flags           uint8           Bit 0: Deflate compressed (1=yes, 0=no)
3       4       CRC-32          uint32 BE       IEEE 802.3 CRC-32 of uncompressed payload
7       L'      Payload Data    bytes           Payload (raw or Deflate compressed)
7+L'    Pad     CSPRNG Padding  bytes           Random noise filling remaining bucket
```

### 5.2 Discrete Bucket Sizes
The total plaintext frame size is rounded up to the nearest standard discrete bucket:
$$\text{Bucket Sizes: } 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072\text{ bytes}$$

### 5.3 Opaque Wire Envelope
The framed bucket is encrypted via AES-256-GCM and prefixed with the CSPRNG salt:

```
Offset  Length  Field           Type            Description
--------------------------------------------------------------------------------
0       16      Salt            bytes           CSPRNG 16-byte random salt
16      B       Ciphertext      bytes           AES-256-GCM ciphertext of bucket (B bytes)
16+B    16      Auth Tag        bytes           AES-256-GCM 16-byte authentication tag
```

Total wire envelope length: $16 + B + 16 = B + 32$ bytes.

---

## 6. Layer 5 — Multi-Carrier Threshold Distribution

When splitting a vault across $n$ photo carriers with threshold $k$:
1. The vault document is erasure-coded using **Cauchy MDS Reed-Solomon Parity Coding** over $\text{GF}(256)$.
2. Carrier capacities are allocated proportionally according to available non-zero AC coefficients, subject to:
   - **Carrier Capacity Clamping:** Each carrier's usable capacity is clamped to `DEFAULT_MAX_CARRIER_BYTES = 65536` (64 KB) to prevent oversized photos from dominating total capacity.
   - **No-SPOF Invariant:** In proportional parity mode, no single carrier may hold $\ge k$ blocks or exceed $40\%$ of threshold $k$ (`maxSharePerCarrier = 0.4`), ensuring no single image becomes a single point of failure or unilaterally holds reconstruction quorum.
3. The cryptographic DEK is secret-shared across carriers using **$\text{GF}(256)$ Shamir Secret Sharing**.
4. Recovery succeeds from **any valid $k$-subset** of carriers and fails closed on $k-1$ carriers.

---

## 7. Test Conformance Vectors

All implementations MUST conform to the formal property-based test suites in `test/conformance/wire-format-conformance.test.js` and `test/conformance/wire-format.pbt.js`.
