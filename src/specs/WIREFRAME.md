# Ollie — Project Wireframe

Complete mermaid.js map of the codebase: layers, module dependencies,
runtime pipelines, the wire-format stack, vault flows, and test architecture.

> **Living document** — see `src/specs/rules/code-quality.md` rule 15.
> Any change that adds/removes/renames/moves a module or changes a
> cross-layer dependency MUST update this file in the same change.
>
> Wire-level byte formats are normatively specified in
> `src/specs/container-wire-format.md`; this document shows structure only.

---

## 1. Directory Layout

```text
Ollie/
├── app/                          # Browser UI (ES modules, no framework)
│   ├── vault.html                # Vault page (entry HTML)
│   ├── test.html                 # Browser test runner (mirrors Node suite)
│   ├── vault.js                  # Vault page bootstrap
│   └── components/
│       ├── assets/               # SVG icons
│       └── vault/
│           ├── vault-ui.js       # Vault orchestrator (onboarding, rotation, 2FA, save/load/search)
│           ├── vault.css         # Styling: toasts, wizard, card grid, modals
│           └── components/
│               ├── drop-zone.js          # File drop (folder traversal)
│               ├── modal-manager.js      # Modal manager orchestrator
│               ├── onboarding-wizard.js  # First-run onboarding wizard
│               ├── qr-canvas.js          # QR code canvas renderer
│               ├── vault-modals.js       # Change password, 2FA settings, shortcuts modals
│               └── vault-view.js         # Card grid renderer + selection & scroll anchor
├── scripts/
│   ├── cli.mjs                   # Headless vault save/load/verify
│   ├── dev-server.js             # Local dev server
│   └── generate-golden-vectors.mjs # Regenerates conformance vectors
├── src/
│   ├── algebraic/                # Pure math transforms (no I/O)
│   │   ├── colorspace/           # rgb-to-ycbcr
│   │   ├── discrete-cosine/      # forward-dct, inverse-dct (+spec variants)
│   │   ├── mappings/             # blocks, zigzag, up/downsampling, assembly
│   │   └── quantization/         # forward/inverse quantization
│   ├── automata/                 # Bit-level state machines
│   │   ├── bit-streams/          # bit-reader(s), bit-writer, bit-core
│   │   ├── entropy-coding/       # huffman encoder/decoder FSMs
│   │   └── parsers/              # marker/dht/dqt/sof/sos/spiff automata
│   ├── codec/                    # High-level orchestrators
│   │   ├── encoder.js  decoder.js  transcoder.js
│   │   ├── capacity-scanner.js  carrier-pool.js  carrier.worker.js  file-scanner.js
│   │   └── qr-encoder.js     qr-decoder.js
│   ├── information-theory/
│   │   ├── cryptography/         # kdf-chain (Argon2id + HKDF), kdf.worker.js, pbkdf2, aes-gcm, hmac, totp, crypto-provider
│   │   ├── error-correction/     # galois-field, reed-solomon-codec, rs-interleaver
│   │   ├── secret-sharing/       # gf-shamir (k-of-n), css-envelope, cauchy-ec
│   │   └── steganography/        # stego-engine, opaque-container, stc-matrix, juniward,
│   │                             # chunk-manager, carrier-manifest, batch-embedder/-extractor
│   ├── structures/vault/         # immutable-vault, secure-record, csv-import
│   ├── utils/                    # crc32, encoding, compression, logger, url-safety,
│   │                             # escape-html, atomic-writer, csv, base32, password-strength,
│   │                             # concurrency (worker-pool, worker-adapter, worker-runtime, tuple-serializer)
│   ├── vendor/argon2/            # Vendored OpenPGP.js Argon2id WASM SIMD/non-SIMD engine
│   └── specs/                    # Normative specs and project rules
├── test/                         # Node runner + browser suite (see §6)
└── src/specs/WIREFRAME.md        # This file
```

---

## 2. Layered Architecture

Strict downward dependencies only — no upward imports anywhere in the codebase.

```mermaid
flowchart TB
    subgraph ENTRY["Entry Points"]
        VAULTPAGE["app/vault.js<br/>vault page bootstrap"]
        CLI["scripts/cli.mjs<br/>headless save/load/verify"]
    end

    subgraph APP["app/components — Browser UI"]
        VUI["vault-ui<br/>+ drop-zone / modal / vault-view"]
    end

    subgraph STRUCT["structures/vault"]
        PV["PasswordVault<br/>immutable-vault.js"]
        SE["SecureEntry<br/>secure-record.js"]
        CI["CSV import<br/>csv-import.js"]
    end

    subgraph IT["information-theory"]
        STEGO["steganography<br/>StegoEngine · OpaqueContainer · STCMatrix · JUniward"]
        BATCH["batch-embedder · batch-extractor · chunk-manager"]
        MANIFEST["carrier-manifest<br/>HMAC-authenticated set summaries"]
        CSS["secret-sharing<br/>gf-shamir · css-envelope · cauchy-ec"]
        ECC["error-correction<br/>rs-interleaver · reed-solomon-codec · galois-field"]
        CRYPTO["cryptography<br/>kdf-chain · argon2id · aes-gcm · hmac · crypto-provider · totp"]
    end

    subgraph CODEC["codec"]
        JE["JpegEncoder"]
        JD["JpegDecoder"]
        JT["JpegTranscoder"]
        CAP["CapacityScanner"]
        CPOOL["CarrierPool · Workers"]
        FSC["FileScanner"]
        QRD["QRDecoder"]
    end

    subgraph MATH["algebraic — pure transforms"]
        DCT["DCT / IDCT"]
        QUANT["quantization"]
        MAPS["zigzag · blocks · sampling"]
        COLOR["colorspace"]
    end

    subgraph AUTO["automata — bit-level FSMs"]
        BITS["bit-streams<br/>BitReader · BitWriter"]
        HUF["huffman FSMs"]
        PARSERS["JPEG marker parsers"]
    end

    subgraph VENDOR["vendor"]
        ARGON2["argon2id WASM<br/>OpenPGP.js core engine"]
    end

    UTILS["utils<br/>crc32 · compression · encoding · logger · url-safety · base32 · concurrency (WorkerPool)"]
    WEBCRYPTO["WebCrypto / SubtleCrypto<br/>platform boundary"]

    VAULTPAGE --> VUI

    VUI --> PV
    VUI --> CAP
    VUI --> FSC
    VUI --> CI
    CLI --> PV
    CLI --> CI

    PV --> SE
    PV --> BATCH
    PV --> CRYPTO
    SE --> CRYPTO

    BATCH --> STEGO
    BATCH --> MANIFEST
    BATCH --> CSS
    BATCH --> CODEC

    STEGO --> CRYPTO
    STEGO --> MATH
    STEGO --> UTILS

    CRYPTO --> VENDOR
    CRYPTO --> WEBCRYPTO
    CRYPTO --> UTILS

    CODEC --> MATH
    CODEC --> AUTO
    CODEC --> UTILS

    ECC --> UTILS
    MATH --> UTILS
    AUTO --> UTILS
```

---

## 3. Module Import Graph

```mermaid
flowchart LR
    subgraph UI_LAYER["app/"]
        vui["vault-ui.js"]
        dz["drop-zone.js"]
        mm["modal-manager.js"]
        vv["vault-view.js"]
    end

    subgraph STRUCT_LAYER["structures/"]
        pv["immutable-vault.js"]
        securerec["secure-record.js"]
        csvimp["csv-import.js"]
    end

    subgraph CODEC_LAYER["codec/"]
        enc["encoder.js"]
        dec["decoder.js"]
        trans["transcoder.js"]
        cap["capacity-scanner.js"]
        fsc["file-scanner.js"]
        qr["qr-encoder.js"]
        qrdec["qr-decoder.js"]
    end

    subgraph IT_LAYER["information-theory/"]
        stego["stego-engine.js"]
        opaque["opaque-container.js"]
        stc["stc-matrix.js"]
        juniward["juniward.js"]
        bem["batch-embedder.js"]
        bex["batch-extractor.js"]
        cm["chunk-manager.js"]
        cman["carrier-manifest.js"]
        shamir["gf-shamir.js"]
        env["css-envelope.js"]
        cauchy["cauchy-ec.js"]
        kdf["kdf-chain.js"]
        pbkdf["pbkdf2.js"]
        aes["aes-gcm.js"]
        hmack["hmac.js"]
        totpmod["totp.js"]
        cprov["crypto-provider.js"]
    end

    subgraph VENDOR_LAYER["vendor/"]
        argon["argon2/index.js"]
    end

    subgraph UTILS_LAYER["utils/"]
        crc["crc32.js"]
        comp["compression.js"]
        encod["encoding.js"]
        b32["base32.js"]
        log["logger.js"]
        url["url-safety.js"]
        esc["escape-html.js"]
        aw["atomic-writer.js"]
        csv["csv.js"]
    end

    vui --> dz
    vui --> mm
    vui --> vv
    vui --> pv
    vui --> cap
    vui --> fsc
    vui --> csvimp
    vui --> totpmod
    vui --> qrdec
    vui --> pbkdf
    vui --> aw

    mm --> esc
    mm --> qrdec
    mm --> qr
    vv --> esc
    vv --> url

    pv --> securerec
    pv --> bem
    pv --> bex
    pv --> pbkdf
    pv --> aes
    pv --> totpmod
    pv --> b32
    pv --> cprov
    pv --> encod
    securerec --> aes
    securerec --> encod

    bem --> cm
    bem --> trans
    bem --> stego
    bem --> cman
    bem --> cauchy
    bem --> env
    bex --> cm
    bex --> dec
    bex --> cman
    bex --> env
    bex --> cauchy
    bex --> encod
    cman --> encod

    stego --> opaque
    stego --> stc
    stego --> juniward
    stego --> kdf
    stego --> cprov

    opaque --> kdf
    opaque --> aes
    opaque --> crc
    opaque --> comp
    opaque --> cprov

    kdf --> argon
    kdf --> cprov

    cman --> hmack
    cman --> pbkdf
    env --> shamir
    env --> aes
    shamir --> cauchy
```

---

## 4. Format v4 Steganographic Embed/Extract Pipeline

```mermaid
sequenceDiagram
    autonumber
    participant U as User / UI / CLI
    participant E as JpegEncoder / Transcoder
    participant SE as StegoEngine.embed
    participant OC as OpaqueContainer.sealOpaque
    participant KDF as KDFChain (Argon2id + HKDF)
    participant JUNI as J-UNIWARD (Daubechies db8)
    participant STC as STCMatrix.stcEmbed (Viterbi Trellis)

    U->>E: encode(imageData, payload, password)
    E->>E: Flatten quantized DCT blocks (AC coefficients)
    E->>SE: embed(blocks, payload, password)
    
    SE->>OC: sealOpaque(payload, password, { bucketSize })
    OC->>KDF: deriveStegoKeys(password, salt) [t=3, m=64MB, p=1]
    KDF-->>OC: { aesKey, aesIV, stcSeed, costSeed }
    OC->>OC: Deflate/Framing + CSPRNG noise bucket padding
    OC->>OC: AES-256-GCM encrypt
    OC-->>SE: wireEnvelope = [Salt:16B] || [Ciphertext:B+16B]

    SE->>JUNI: calculateJUniwardCosts(blocks, qTable, { costSeed })
    Note over JUNI: 2D IDCT -> 3 directional wavelet subbands -> spatial sensitivity map -> rho AC costs
    JUNI-->>SE: { rhoPlus, rhoMinus }

    SE->>STC: stcEmbed(coverAC, wireBits, rhoPlus, rhoMinus, { h:8, seed:stcSeed })
    Note over STC: Viterbi dynamic programming over H_hat parity trellis (w <= 4, algebraic predecessor recovery, 2-bit packed transitions)
    STC-->>SE: stegoAC
    SE->>E: Write stego coefficients back to DCT blocks
    E-->>U: Stego JPEG carrier
```

---

## 5. Master Password & Salt Rotation Pipeline

```mermaid
sequenceDiagram
    autonumber
    participant UI as VaultUI / Modal
    participant V as PasswordVault (v_N)
    participant KDF as KeyDerivation (PBKDF2 / Argon2id)
    participant GCM as Encryption (AES-GCM)
    participant VN as PasswordVault (v_N+1)

    UI->>UI: ModalManager.showChangePasswordModal()
    UI->>UI: Hardware Benchmark (calibrates target work factor)
    UI->>V: changeMasterPassword(newPassword, { iterations >= 600k })
    V->>V: unwrap rawSessionKey (AES-256) under current password KEK
    V->>KDF: generate fresh CSPRNG salt
    V->>KDF: deriveKey(newPassword, newSalt, { iterations })
    V->>GCM: encrypt(rawSessionKey, newKek)
    Note over V: Construct updated metadata.kdf block<br/>Update lastRotated timestamp and revision counter
    V-->>VN: return [new PasswordVault, null]
    Note over VN: All entries remain untouched without expensive re-encryption
    VN-->>UI: Vault updated & unlocked under new credential
```

---

## 6. Multi-Methodology Test Spectrum (Rule 14)

```mermaid
flowchart TB
    RUNNER["test/runner.js (Node.js Entry / Parallel Orchestrator)<br/>app/test.html (Browser Harness)"]
    PARALLEL["test/runner-parallel.js<br/>Dynamic Work Queue & Priority Scheduling"]
    WORKER["test/utils/worker-test-executor.js<br/>Isolated V8 Worker Isolates (node:worker_threads)"]

    RUNNER --> PARALLEL
    PARALLEL --> WORKER

    subgraph SPECTRUM["Test Spectrum (155 Suites, 1,082 Tests)"]
        subgraph UNIT["1. Unit Tests"]
            ALGT["algebraic/*"]
            AUTT["automata/*"]
            CODECT["codec/*"]
            ITT["information-theory/* (argon2id, kdf-chain, opaque-container, stc-matrix, juniward, stego-engine)"]
            STRUCTT["structures/vault/*"]
        end

        subgraph INTEG["2. Integration Tests"]
            ROUND["roundtrip · steganography-roundtrip"]
            VE2E["vault-e2e · vault-e2e-crud · vault-e2e-carriers · vault-spread-save"]
            VUIFLOW["vault-ui-redesign · vault-ui-polish · vault-capacity-ui · vault-totp-display · vault-tierb-flow"]
        end

        subgraph E2E["3. End-to-End Tests"]
            FULLV["Full Carrier Steganography Embed/Extract Loop"]
            CLIE2E["CLI save/load/verify · --threshold"]
        end

        subgraph PBTW["4. Property-Based Tests (PBT)"]
            HARNESS["utils/pbt.js · Seeded PRNG + Shrinking"]
            ROTPBT["password-rotation.test.js (Decryption identity)"]
            WFPBT["conformance/wire-format.pbt.js (STC & Opaque Framing)"]
            SECPBT["secure-record.test.js (Plaintext absence)"]
        end

        subgraph MT["5. Metamorphic Tests (MT)"]
            MR1["MR1: Work factor monotonic duration"]
            MR2["MR2: Benchmark recommendation scaling"]
            MR3["MR3: Multistep rotation entry identity"]
        end

        subgraph FUZZ["6. Fuzz & Boundary Tests"]
            KDFFUZZ["kdf-fuzz.test.js (Unicode / surrogates / null-bytes)"]
            CRYPTOFUZZ["crypto-fuzz.mjs"]
            PARSERFUZZ["parser-fuzz.mjs"]
        end
    end

    WORKER --> UNIT
    WORKER --> INTEG
    WORKER --> E2E
    WORKER --> PBTW
    WORKER --> MT
    WORKER --> FUZZ
```
