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
│   ├── index.html / debug.html / test.html / vault.html
│   ├── main.js                   # Demo entry point (encoder/decoder tabs)
│   ├── vault.js                  # Vault page bootstrap
│   └── components/
│       ├── encoder-ui.js         # Encode tab (quality, ECC options)
│       ├── decoder-ui.js         # Decode tab (IDCT/bitreader switching)
│       ├── tabs.js               # Tab shell
│       └── vault/
│           ├── vault-ui.js       # Vault orchestrator (save/load/search)
│           └── components/
│               ├── drop-zone.js      # File drop (folder traversal)
│               ├── modal-manager.js  # Confirm/prompt dialogs
│               └── vault-view.js     # Entry list + URL safety gate
├── scripts/
│   ├── cli.mjs                   # Headless vault save/load/verify
│   ├── dev-server.js             # Local dev server
│   ├── generate-golden-vectors.mjs  # Regenerates conformance vectors
│   └── debug-rs-limit.js         # RS debugging aid
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
│   │   ├── capacity-scanner.js  file-scanner.js
│   ├── information-theory/
│   │   ├── cryptography/         # pbkdf2, aes-gcm, crypto-provider
│   │   ├── error-correction/     # galois-field, reed-solomon-codec, rs-interleaver
│   │   └── steganography/        # f5-syndrome, batch-embedder/-extractor, chunk-manager
│   ├── structures/vault/         # immutable-vault, secure-record
│   ├── utils/                    # crc32, encoding, logger, url-safety,
│   │                             # escape-html, atomic-writer
│   └── specs/                    # Normative specs and project rules
├── test/                         # Node runner + browser suite (see §7)
├── docs/audits/                  # Historical audit reports (archived)
└── WIREFRAME.md                  # This file
```

---

## 2. Layered Architecture

Strict downward dependencies only — no upward imports anywhere in the codebase.

```mermaid
flowchart TB
    subgraph ENTRY["Entry Points"]
        MAIN["src/main.js<br/>demo UI bootstrap"]
        VAULTPAGE["app/vault.js<br/>vault page bootstrap"]
        CLI["scripts/cli.mjs<br/>headless save/load/verify"]
    end

    subgraph APP["app/components — Browser UI"]
        ENCUI["encoder-ui"]
        DECUI["decoder-ui"]
        VUI["vault-ui<br/>+ drop-zone / modal / vault-view"]
    end

    subgraph STRUCT["structures/vault"]
        PV["PasswordVault<br/>immutable-vault.js"]
        SE["SecureEntry<br/>secure-record.js"]
    end

    subgraph IT["information-theory"]
        STEGO["steganography<br/>F5 · BatchEmbedder · BatchExtractor · ChunkManager"]
        ECC["error-correction<br/>rs-interleaver · reed-solomon-codec · galois-field"]
        CRYPTO["cryptography<br/>pbkdf2 · aes-gcm · crypto-provider"]
    end

    subgraph CODEC["codec"]
        JE["JpegEncoder"]
        JD["JpegDecoder"]
        JT["JpegTranscoder"]
        CAP["CapacityScanner"]
        FSC["FileScanner"]
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

    UTILS["utils<br/>crc32 · encoding · logger · url-safety"]
    WEBGPU["WebCrypto<br/>platform boundary"]

    MAIN --> ENCUI
    MAIN --> DECUI
    VAULTPAGE --> VUI

    ENCUI --> JE
    DECUI --> JD
    VUI --> PV
    VUI --> CAP
    VUI --> FSC
    CLI --> PV

    PV --> SE
    PV --> STEGO
    PV --> CRYPTO
    SE --> CRYPTO

    STEGO --> ECC
    STEGO --> CRYPTO
    STEGO --> CODEC

    JE --> MATH
    JE --> AUTO
    JD --> MATH
    JD --> AUTO
    JT --> JE
    JT --> JD
    CAP --> JD
    CAP --> STEGO

    CRYPTO --> WEBGPU
    STEGO --> UTILS
    CODEC --> UTILS
```

---

## 3. Module Dependency Graph (verified import edges)

```mermaid
flowchart LR
    subgraph app
        encui["encoder-ui.js"]
        decui["decoder-ui.js"]
        vui["vault-ui.js"]
        vview["vault-view.js"]
        vaultpage["vault.js"]
        cli["cli.mjs"]
    end

    subgraph shared
        esc["utils/escape-html.js"]
        awriter["utils/atomic-writer.js"]
    end

    subgraph structures
        pv["immutable-vault.js"]
        securerec["secure-record.js"]
    end

    subgraph stego
        f5["f5-syndrome.js"]
        bem["batch-embedder.js"]
        bex["batch-extractor.js"]
        cm["chunk-manager.js"]
    end

    subgraph ecc
        rsi["rs-interleaver.js"]
        shim["reedsolomon.js"]
        rsc["reed-solomon-codec.js"]
        gf["galois-field.js"]
    end

    subgraph crypto
        pbkdf["pbkdf2.js"]
        aes["aes-gcm.js"]
        cprov["crypto-provider.js"]
    end

    subgraph codec
        enc["encoder.js"]
        dec["decoder.js"]
        trans["transcoder.js"]
        cap["capacity-scanner.js"]
        fscan["file-scanner.js"]
    end

    encui --> enc
    decui --> dec
    vview --> urlsafe["utils/url-safety.js"]
    vview --> esc
    vui --> awriter

    vaultpage --> bem
    vaultpage --> bex
    vaultpage --> fscan
    cli --> pv
    vui --> pv
    vui --> cap
    vui --> fscan

    pv --> securerec
    pv --> bem
    pv --> bex
    pv --> pbkdf
    pv --> aes
    securerec --> aes

    bem --> cm
    bem --> trans
    bem --> f5
    bex --> cm
    bex --> dec
    cm --> cprov
    cm --> crc["utils/crc32.js"]

    f5 --> rsi
    f5 --> aes
    f5 --> pbkdf
    f5 --> cprov
    f5 --> crc

    rsi --> shim
    shim --> idx["error-correction/index.js"]
    idx --> rsc
    rsc --> gf

    enc --> alg["algebraic/*"]
    enc --> huffenc["huffman-encoder-fsm"]
    enc --> bw["bit-writer"]
    enc --> f5
    dec --> parsers["parsers/*"]
    dec --> br["bit-reader"]
    dec --> huffdec["huffman-decoder-fsm"]
    dec --> alg
    dec --> f5
    trans --> enc
    trans --> dec
    cap --> dec
    cap --> bem
```

---

## 4. Steganographic Encode/Extract Pipeline

```mermaid
sequenceDiagram
    autonumber
    participant U as User / UI / CLI
    participant E as JpegEncoder
    participant F as F5.embedContainer
    participant AES as Encryption (AES-GCM)
    participant RS as ErrorCorrection.protect
    participant ER as F5.embedRaw

    U->>E: encode(imageData, secretData, options)
    E->>E: color -> blocks -> DCT -> quantize
    E->>F: embedContainer(blocks, payload, metadata)

    opt password set (Layer 4)
        F->>AES: encrypt(payload, PBKDF2(password, salt))
        AES-->>F: ciphertext + iv
        Note over F: payload = salt(16) + iv(12) + ct(+tag16)
    end

    opt metadata.ecc (Layer 3)
        F->>RS: protect(payload, eccProfile)
        RS-->>F: interleaved RS(255,k) blocks
    end

    Note over F: frame container v2:<br/>F5SG | ver | flags | k | metaLen | JSON | len | payload | CRC32

    F->>ER: embedRaw(blocks, container, seed, k)
    Note over ER: xoshiro128** permutation over all AC indices,<br/>matrix encoding k bits per n=2^k-1 group
    ER-->>E: mutated coefficients
    E->>U: JPEG carrier bytes
```

Extraction mirrors it: `JpegDecoder.decode` collects blocks and calls
`F5.extractAuto`, which scans k=1..4 for the `F5SG` magic, parses the header,
verifies CRC32 (attempting ECC recovery when `metadata.ecc`), unwraps AES when
encrypted, and returns `{ data, metadata }`. `BatchExtractor` then groups chunk
records across carriers and reassembles via `ChunkManager`.

---

## 5. Wire-Format Stack (v2, frozen)

Byte-exact conformance vectors: `test/conformance/golden-vectors.json`.

```mermaid
flowchart TB
    L6["Layer 6 — Vault document / export envelope<br/>JSON v3.0 · session-key wrap · ollie-export v1"]
    L5["Layer 5 — Multi-carrier chunking<br/>chunk id UUID · index/total · CRC32 per chunk"]
    L4["Layer 4 — Encryption envelope<br/>PBKDF2-SHA256 (50k-10M iter) + AES-256-GCM<br/>salt16 + iv12 + ct+tag16"]
    L3["Layer 3 — ECC framing<br/>RS(255,k) GF(256) poly 0x11D · Low..Extreme<br/>column-major interleave"]
    L2["Layer 2 — Container framing v2<br/>F5SG | ver=2 | flags | k | metaLen | metadata JSON | len | payload | CRC32"]
    L1["Layer 1 — F5 embedding<br/>matrix encoding · shrinkage retry · seeded permutation"]
    L0["Layer 0 — Carrier mapping<br/>JPEG blocks -> flat AC index space (63/block)"]

    L6 --> L5
    L5 --> L4
    L4 --> L3
    L3 --> L2
    L2 --> L1
    L1 --> L0
```

---

## 6. Vault Save / Load Flow

```mermaid
sequenceDiagram
    autonumber
    participant UI as vault-ui / CLI
    participant V as PasswordVault
    participant KDF as KeyDerivation (PBKDF2)
    participant GCM as Encryption (AES-GCM)
    participant BE as BatchEmbedder
    participant CM as ChunkManager

    Note over UI,V: SAVE
    UI->>V: save(imageFiles, masterPassword)
    V->>V: _resolveSessionKey()
    alt new vault
        V->>V: CSPRNG sessionKey (32B)
        V->>KDF: deriveKey(password, fresh salt)
        V->>GCM: wrap sessionKey (AES-GCM)
        Note over V: metadata.kdf = algo/iterations/salt/wrapIV/wrappedSK
    else existing vault
        V->>GCM: unwrap wrappedSessionKey with KEK
    end
    V->>BE: embed(vaultBytes, images, Extreme ECC)
    BE->>CM: split into per-carrier chunks (id/index/total)
    BE->>BE: transcoder.updateSecret per image (F5 container)
    BE-->>UI: stego JPEG carriers

    Note over UI,V: LOAD
    UI->>V: load(imageFiles, masterPassword)
    V->>V: extract + reassemble complete chunk group
    V->>KDF: rederive KEK from stored kdf block
    V->>GCM: unwrap session key (fails closed on wrong password)
    V-->>UI: unlocked PasswordVault (revision reported)
```

---

## 7. Test Architecture

```mermaid
flowchart TB
    RUNNER["test/runner.js<br/>Node orchestrator · PBT seed log"]

    subgraph UNIT["Unit suites"]
        ALGT["algebraic/*"]
        AUTT["automata/*"]
        CODECT["codec/*<br/>incl. format-v2 · result-contracts"]
        ITT["information-theory/*<br/>stego · ECC · crypto"]
        STRUCTT["structures/vault/*"]
    end

    subgraph SEC["Security suites test/security"]
        FORGED["forged-metadata"]
        PROBE["probe-regressions"]
        XSS["xss · url-safety"]
        HARD["decoder/vault hardening"]
    end

    subgraph CONF["Conformance"]
        GOLD["wire-format-conformance.test.js<br/>bit-exact golden vectors"]
        VECJSON["golden-vectors.json<br/>regen: scripts/generate-golden-vectors.mjs"]
    end

    subgraph PBTW["Property-based (seeded via PBT_SEED)"]
        HARNESS["utils/pbt.js<br/>Arbitrary + shrinking"]
        WFPBT["conformance/wire-format.pbt.js"]
        OTHERPBT["capacity-scanner.pbt.js<br/>+.pbt properties across suites"]
    end

    INTEG["integration/*<br/>roundtrip · vault e2e · ECC"]
    BROWSER["app/test.html<br/>browser suite"]

    RUNNER --> UNIT
    RUNNER --> SEC
    RUNNER --> CONF
    RUNNER --> PBTW
    RUNNER --> INTEG
    GEN["generate-golden-vectors.mjs"] --> VECJSON
    VECJSON --> GOLD
    HARNESS --> WFPBT
    HARNESS --> OTHERPBT
    BROWSER -.same suites.-> UNIT
```

---

## 8. Maintenance Rules

Tracked by `src/specs/rules/code-quality.md` rule 15 (the canonical spec tree):

1. Add/remove/rename/move a module -> update §1 tree, §2 layer graph, §3 edges.
2. Change a cross-module import edge -> update §3 only.
3. Change a runtime pipeline or wire-format layer -> update §4/§5.
4. Add a test suite family or vector source -> update §7.
5. Regenerate golden vectors after any *intentional* format change, never to
   make a failing suite pass.

