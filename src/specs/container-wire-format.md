Ollie Container Wire Format — Reference Specification (v2, frozen)

Status:     Frozen for the Rust port. Implementations MUST match this document
            bit-for-bit for layers 0-3 and structurally for layers 4-6.
Normative:  test/conformance/golden-vectors.json + wire-format-conformance.test.js
Related:    f5-steganography.md (matrix-encoding algorithm core)

All multi-byte integers are BIG-ENDIAN unless stated otherwise.
All byte counts are decimal. "MUST" / "MUST NOT" are normative.

--------------------------------------------------------------------------------
0. Layering Overview
--------------------------------------------------------------------------------

A vault travels through six framing layers. Each layer wraps the previous one;
a reader unwraps in reverse order.

  Layer 6  Vault document / export envelope      (JSON, application)
  Layer 5  Multi-carrier chunk framing           (split/reassemble across JPEGs)
  Layer 4  Encryption envelope                   (PBKDF2 + AES-256-GCM)
  Layer 3  ECC framing                           (RS(255,k) interleaved blocks)
  Layer 2  Container framing v2                  (magic/version/flags/k/meta/crc)
  Layer 1  F5 embedding                          (matrix encoding over AC coeffs)
  Layer 0  Carrier mapping                       (JPEG blocks -> flat index space)

--------------------------------------------------------------------------------
1. Layer 0 - Carrier Mapping
--------------------------------------------------------------------------------

The carrier is a baseline JPEG entropy-decoded to quantized DCT blocks.

1.1 Block collection. Blocks are collected per component in frame-header
    component order. The canonical encoder order is Y, then Cb, then Cr
    (`JpegEncoder.flattenBlocks`). Decoders MUST use the SOF component ID order.
    For 4:2:0 streams the MCU re-ordering of the decoder defines block order;
    embedding and extraction on the same build are self-consistent because both
    walk the identical array.

1.2 Flat AC index space. Each 8x8 block contributes exactly 63 usable slots:
    coefficients 1..63 (DC, coefficient 0, is NEVER used). The flat index space
    has size N = blockCount * 63 where

        flatIndex i  ->  block   floor(i / 63)
                         coeff   (i mod 63) + 1

1.3 Eligibility. A slot is eligible during a group walk iff its current
    coefficient value is non-zero. Eligibility is evaluated lazily; zero values
    are skipped without consuming message bits.

--------------------------------------------------------------------------------
2. Layer 1 - F5 Embedding Parameters
--------------------------------------------------------------------------------

The algorithm core (syndrome coding, shrinkage retry) is specified in
f5-steganography.md. This section pins the exact parameter choices that vectors
depend on. Deviations here break every bit-exact vector.

2.1 Permutation seed resolution (in priority order):
    a. Explicit `seed` option wins verbatim (testing/special modes).
    b. If a password is set:  seed = lowercase-hex(SHA-256(
           "ollie/f5/permutation/v2/" || UTF8(password) ))
       (32-byte digest rendered as 64 ASCII hex characters)
    c. Otherwise: seed = "F5SG:v2:public"  (PUBLIC_SEED constant).
    There is no silent default key; passwordless carriers are public by design.

2.2 PRNG: xoshiro128** with the canonical scramble
        out = rotl(rotl(s1*5, 7), 9) + s0   (mod 2^32, Math.imul semantics)
        t = s1 << 9 ; s2 ^= s0 ; s3 ^= s1 ; s1 ^= s2 ; s0 ^= s3 ;
        s2 ^= t ; s3 = rotl(s3, 11)
    Initial state (all lanes, big-endian constants):
        s0 = 0x243F6A88  s1 = 0x85A308D3  s2 = 0x13198A2E  s3 = 0x03707344

2.3 Seeding: FNV-style diffusion of the seed bytes over 4 independent lanes.
    For byte index i (0-based), lane = i mod 4:
        lane_state ^= byte ; lane_state *= 0x01000193 (mod 2^32)
    starting from the initial state above. Every seed byte contributes.

2.4 Permutation: Fisher-Yates over indices 0..N-1 descending, drawing uniform
    uint32s with REJECTION SAMPLING (no modulo bias):
        threshold = (2^32 mod bound); redraw while draw < threshold; j = draw mod bound
    The permutation is a pure function of (N, seed). It MUST NOT depend on
    coefficient values, non-zero counts, or shrinkage events.

2.5 Matrix-encoding k selection (embed side):
        for k in 4..1:  n = 2^k - 1
                        P = min(0.9, (n/(n+1)) * p1 * 1.5)
                        costPerGroup = n + P/(1-P)
                        capacityBits = floor((nonZeroCount / costPerGroup) * k)
                        accept k when capacityBits >= messageBits
        fallback k = 1
    where p1 = onesCount/nonZeroCount (coefficients equal to +-1).
    Extraction accepts an explicit k or searches k = 1..4 against the magic
    (see 3.4). When a container header stores K (section 3.1) the reader uses
    the k that successfully decoded the magic and cross-checks the stored byte,
    warning on mismatch but trusting the working k.

2.6 Bit/byte order: message bytes expand MSB-first into bits; extracted bits
    pack back MSB-first. A trailing partial k-bit chunk is left-aligned
    (zero-padded at the LSB end).

--------------------------------------------------------------------------------
3. Layer 2 - Container Framing v2
--------------------------------------------------------------------------------

3.1 Layout (total size L = 17 + metaLen + payloadLen):

    offset  size  field         notes
    ------  ----  ------------  ---------------------------------------------
    0       4     Magic         ASCII "F5SG" (0x46 0x35 0x53 0x47)
    4       1     Version       0x02. Readers MUST reject other versions.
    5       1     Flags         0x00 (reserved; no flag semantics defined)
    6       1     K             matrix-encoding k used for THIS container
    7       2     MetaLen       uint16 BE, length of Metadata in bytes
    9       N     Metadata      MetaLen bytes, UTF-8 JSON object (see 3.2)
    9+N     4     PayloadLen    uint32 BE; readers MUST reject > 104857600
    13+N    M     Payload       PayloadLen bytes (layer 3+ envelope)
    13+N+M  4     CRC32         uint32 BE over bytes [0, 13+N+M)

3.2 Metadata JSON. Free-form JSON object; readers MUST tolerate unknown keys
    and MUST validate known security-relevant keys before acting on them:

    Key            Type      Validation on read
    -------------  --------  --------------------------------------------------
    ecc            boolean   presence selects the ECC path after CRC handling
    eccProfile     string    MUST be a key of ECC_PROFILES (section 4.1)
    originalLength integer   >= 0, <= 104857600, <= blockCount * dataBytes
    blockCount     integer   >= 1, <= floor(payloadLen / 255)
    encrypted      boolean   presence requires metadata.enc (next)
    enc.kdf        string    MUST equal "PBKDF2-SHA256"
    enc.iterations integer   MUST be within [50000, 10000000]

    Producers SHOULD emit keys in this order: filename?, chunk?, checksum?,
    ecc, eccProfile?, originalLength?, blockCount?, enc?  (JSON key order is
    not semantic but IS covered by the CRC; byte-exact vectors pin one order.)

3.3 CRC32: standard IEEE reflected CRC-32, polynomial 0xEDB88320, initial
    0xFFFFFFFF, final XOR 0xFFFFFFFF (zlib/PNG compatible). The check value of
    ASCII "123456789" is 0xCBF43926.

3.4 Detection. Readers search k = 1..4, extracting the first 4 bytes under
    each candidate k until the magic matches. On no match the carrier holds no
    container (return null, do NOT fall back to guessing).

3.5 Legacy framing (deprecated, kept read-compatible): pre-container payloads
    are [uint32 BE length][data] embedded raw; extraction reads 32 bits as the
    length, rejects lengths > 104857600, then extracts (4+length)*8 bits.
    New writers MUST NOT emit legacy framing.

--------------------------------------------------------------------------------
4. Layer 3 - ECC Framing (Reed-Solomon)
--------------------------------------------------------------------------------

4.1 Code parameters. RS(255, k) over GF(256) using the QR-code field
    (primitive polynomial 0x11D, generator alpha = 2). Systematic encoding:
    message occupies symbol positions 0..k-1, parity symbols k..254.
    One profile applies uniformly to ALL blocks of a payload.

    Profile   dataBytes k   parityBytes   overhead   correctable symbols
    --------  -----------   -----------   --------   -------------------
    Low       251           4             ~1.6%      2
    Medium    223           32            ~14%       16
    High      191           64            ~33%       32
    Ultra     127           128           ~100%      64
    Extreme   85            170           ~200%      85

4.2 Block construction. Split the payload into ceil(len / dataBytes) blocks.
    Each block is zero-padded in its data region to dataBytes, then encoded
    with parityBytes redundancy into a 255-symbol codeword. The final block's
    padding zeros ARE encoded (they are part of the codeword).

4.3 Interleaving (burst resistance). Codewords are transposed column-major:

        encoded[bytePos * blockCount + blockIdx] = block[blockIdx][bytePos]

    for bytePos in 0..254, blockIdx in 0..blockCount-1. Encoded size is
    exactly blockCount * 255. De-interleaving reverses the same indexing.

4.4 Recovery contract. Given encoded payload, profile, originalLength and
    blockCount from container metadata, the reader MUST validate BEFORE any
    allocation or decode:
        - eccProfile is a known profile
        - blockCount is an integer, 1 <= blockCount <= floor(len/255)
        - originalLength is an integer, 0 <= originalLength <= blockCount*dataBytes
    Invalid combinations MUST fail closed (no zero-filled output buffers).
    Decoding failure of any single block fails the whole recovery.

4.5 Interaction with CRC. On CRC mismatch of a container WITH metadata.ecc,
    the reader attempts ECC recovery of the payload; a successful decode that
    still yields garbage is caught downstream by AES-GCM authentication or the
    vault KDF wrap check. Containers WITHOUT metadata.ecc fail closed on CRC
    mismatch.

4.6 Legacy single-block path (parity count instead of profile) exists for
    internal callers only; containers never reference it. Rust ports need not
    implement it.

--------------------------------------------------------------------------------
5. Layer 4 - Encryption Envelope (container level)
--------------------------------------------------------------------------------

When a password is supplied at embed time, the layer-3 input (the plaintext
payload) is first wrapped as follows:

    payload = salt(16) || iv(12) || ciphertext(= plaintext + 16-byte GCM tag)

    cipher     AES-256-GCM (WebCrypto), random 12-byte IV per embed
    kdf        PBKDF2-HMAC-SHA-256, 16-byte CSPRNG salt, 600000 iterations
               (default since the OWASP ratchet; recorded value authoritative
               within bounds of 3.2)
    key        deriveKey(password, salt, iterations) -> AES-GCM 256-bit

The salt is fresh per embed (NOT a fixed constant). Because the salt and IV sit
INSIDE the ECC-protected region, corruption of those bytes is recoverable up to
the profile's tolerance. Wrong-password detection is provided by GCM tag
verification only; there is no redundant password hint field.

--------------------------------------------------------------------------------
6. Layer 5 - Multi-Carrier Chunk Framing
--------------------------------------------------------------------------------

A payload larger than one carrier's capacity is split into chunks; one chunk is
embedded per carrier image.

6.1 Chunk record (carried inside container Metadata, section 3.2):

    chunk: {
        id:     UUIDv4 string, shared by all chunks of one logical payload
        index:  integer, 0-based position of this chunk
        total:  integer, chunk count for this id
    }
    checksum: CRC32 (section 3.3) over the chunk's raw payload bytes

6.2 Allocation (producer): per-carrier safe capacity is
    floor(scannerCapacity * 0.8); a carrier offering < 10 bytes is skipped;
    chunkSize = min(safeCapacity, remaining). All chunks share one id; `total`
    is fixed AFTER allocation completes.

6.3 Reassembly (consumer): group records by id; reject records whose index or
    total violate 0 <= index < total <= carrierCount; a complete group has
    exactly `total` records with distinct indices covering 0..total-1; verify
    each chunk checksum; concatenate in index order. Any violation fails the
    whole load - there is no partial recovery across chunk sets.

--------------------------------------------------------------------------------
7. Layer 6 - Vault Document & Export Envelope
--------------------------------------------------------------------------------

7.1 Vault document (the layer-5 input is this UTF-8 JSON):

    {
      "metadata": {
        "version": "3.0",                    // readers reject other values
        "revision": <integer >= 0>,          // bumped on every content change
        "created":  <ISO-8601 string>,
        "modified": <ISO-8601 string>,
        "kdf": {                             // REQUIRED since format v2
          "algo": "PBKDF2-SHA256",
          "iterations": <integer>,
          "salt":              <base64, 16 bytes>,
          "wrapIV":            <base64, 12 bytes>,
          "wrappedSessionKey": <base64, 32 bytes + 16-byte GCM tag>
        }
      },
      "entries": [ entry, ... ]
    }

    Session-key wrap: sessionKey = CSPRNG(32 bytes); KEK =
    PBKDF2(masterPassword, salt, iterations); wrappedSessionKey =
    AES-GCM(KEK, wrapIV, sessionKey). Entry ciphertexts are independent of the
    master password; password changes rewrite only the kdf block.

7.2 Entry record:

    {
      "id":       <UUID string, non-empty>,
      "title":    <non-empty string>,          // public field
      "url":      <string>,                    // public fields: url, username
      "username": <string>,
      "tags":     [<string>, ...],
      "created":  <ISO-8601>, "modified": <ISO-8601>,
      "_encrypted": {
        "ciphertext": <base64>,              // AES-GCM under sessionKey
        "iv":         <base64, 12 bytes>
      }
    }

    The plaintext inside _encrypted is JSON:
        { password, notes, totp, customFields: [{label, value}, ...] }
    AES-GCM additionalData for an entry is EXACTLY its UTF-8 `id` (binds each
    ciphertext to its entry; transplanting ciphertexts across entries fails
    authentication).

7.3 Export envelope (portable single-file artifact, independent of carriers):

    {
      "format": "ollie-export",
      "version": 1,
      "kdf": {
        "algo": "PBKDF2-SHA256",
        "iterations": <integer>,
        "salt":       <base64, 16 bytes>,
        "iv":         <base64, 12 bytes>,
        "ciphertext": <base64>               // AES-GCM of the full 7.1 document
      }
    }

    AES-GCM additionalData = UTF8("ollie-export/v1") (format binding).

--------------------------------------------------------------------------------
8. Conformance Requirements
--------------------------------------------------------------------------------

Bit-exact (golden vectors exist, a port MUST reproduce them):
    - CRC32 values                                  (vector group crc32)
    - PRNG draw sequences                           (vector group prng)
    - Permutations for given (N, seed)              (vector group permutation)
    - Seed digests for given passwords              (vector group resolveSeed)
    - RS protect() outputs incl. interleave order   (vector group ecc)
    - embedRaw coefficient mutations                (vector group f5Embed)
    - Full container byte layout                    (vector group container)

Structural only (CSPRNG inputs prevent bit-exactness):
    Layers 4-6: enforce exact sizes (16-byte salt, 12-byte IV, 16-byte tag
    overhead, base64 alphabets), validation rules, AAD bindings and failure
    behavior. Random outputs must differ between runs but decrypt correctly.

Behavioral requirements (tested, not vectorizable):
    - Version != 2 containers are rejected, not mis-read.
    - CRC mismatch without metadata.ecc fails closed.
    - Forged ECC metadata (oversized originalLength/blockCount) fails closed.
    - Corruption within a profile's tolerance recovers byte-exact; beyond it
      fails cleanly.
