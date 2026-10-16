# Ollie — Code Review Report

**Date:** 2026-08-20
**Scope:** Entire repository — `src/` (50 .js), `app/` (8 .js + 4 HTML), `test/` (97 files), `scripts/` (5), and root-level strays (`test-output.txt`, `code-concat-for-perplexity-test.ps1`, `codebase_corpus.txt`, and their duplicates under `scripts/`).
**Methodology:** Full-line read of all application and library source; static dead-code greps across `src/`, `app/`, `test/`; convention audit against `src/specs/` (Result tuple, no try/catch in business logic — rule #6, no dead code — rule #9, no third-party deps, JSDoc on all functions, 100% coverage goal — rule #8); red-team pass targeting the stego/crypto/ECC pipeline and UI attack surface; ground-truth test run `node test/runner.js` → **515 / 515 passed, 0 failed** (baseline: all bugs below exist *behind* a green suite).
**Severity legend:**
- **Critical** — exploitable vulnerability, or data corruption/loss
- **High** — security weakness, correctness bug reachable in normal use, or contract violation
- **Medium** — maintainability issue likely to cause bugs
- **Low** — style / nit

> **Note (added 2026-08-31 by Cy4 audit):** `src/information-theory/steganography/jsteg.js`
> has been removed from the source tree. All findings below that cite `jsteg.js`
> (C23, C34, S3, I3, and the JSTG magic references in S20) are moot for the
> current codebase — `f5-syndrome.js` is the sole steganographic extraction path.
> See `docs/audits/Cy4-Codebuddy-audit.md` finding Cy4-5.

## Summary

| Category | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Critical Bugs | 1 | 13 | 19 | 1 | 34 |
| Style and Consistency | 0 | 0 | 8 | 17 | 25 |
| Idiomatic Improvements | 0 | 1 | 8 | 14 | 23 |
| Feature Ideas | — | — | — | — | 15 |
| **Total findings** | **1** | **14** | **35** | **32** | **82** (+15 ideas) |

The single most important fact in this review: **the vault's session key is derived with a hardcoded, publicly known salt** (C1). Every other security finding is secondary to that one.

---

## 1. Critical Bugs

### [CRITICAL] [SECURITY] C1 — Hardcoded PBKDF2 salt for vault session key
- **File:** `src/structures/vault/immutable-vault.js:25`, `:188`
- **Detail:** `const salt = new TextEncoder().encode('ollie-session-salt-1234');` appears in both `_getSessionKey` and `static load()`. The salt is a compile-time constant shipped in the repo, so it provides zero per-vault entropy.
- **Red-team impact:** An attacker who obtains *any* exported/backup vault file (and the project's own roadmap is to publish these images to public image hosts) can run a GPU-parallel offline dictionary attack against the session key. PBKDF2 with a known salt + 100k iterations (see C2) is roughly one night of cracking for a well-known master password. The "encrypted" guarantee collapses to "obfuscated."
- **Fix:** Generate a random 16-byte salt (`crypto.getRandomValues`) at vault creation, store it in the container header (it is not secret), and derive the session key from `(masterPassword, per-vault salt)`. Never reuse a constant.

### [HIGH] [SECURITY] C2 — PBKDF2 iteration count below OWASP minimum
- **File:** `src/information-theory/cryptography/pbkdf2.js:7`
- **Detail:** `static ITERATIONS = 100000;` — OWASP's current minimum recommendation for PBKDF2-SHA-256 is 600,000.
- **Red-team impact:** 6× faster offline cracking on top of C1. Combined with C1 this is the difference between "weeks" and "hours" for an attacker with a captured backup image.
- **Fix:** Raise to ≥600,000 and record the iteration count in the container header so old vaults can be re-encrypted (key-wrapping) on load.

### [HIGH] [SECURITY] C3 — AES-GCM used with no AAD, no IV validation, exportable key
- **File:** `src/information-theory/cryptography/aes-gcm.js`
- **Detail:** Encryption is AES-GCM with a 12-byte IV and no associated data; the `CryptoKey` is created extractable; IVs are accepted without length validation.
- **Red-team impact:** No AAD means ciphertext is not bound to its container context — a chunk's ciphertext can be transplanted into another container/chunk position (ciphertext migration / key-confusion attacks) and still decrypt. An exportable key can be serialized out of the module and reused outside the intended call sites.
- **Fix:** Pass the container header (magic + version + chunk index + CRC32) as AAD; validate IV length before `decrypt`; create the key `{ extractable: false }` and keep it non-exportable across the API surface.

### [HIGH] [SECURITY] C4 — `getPlaintextJSON()` exposes an unencrypted bulk export
- **File:** `src/structures/vault/immutable-vault.js`
- **Detail:** A public API returns every entry's plaintext (usernames, passwords, notes, URLs) as a single JSON string.
- **Red-team impact:** Any code path (or future UI convenience feature) that calls this is one step from dumping the entire vault to disk/network. In a tool whose whole value proposition is "the plaintext never exists as a file," this is a standing landmine.
- **Fix:** Remove it, or gate it behind an explicit confirmation and keep the result in-memory only (never serialize to Blob/file without the same ceremony as lock/unlock).

### [HIGH] [SECURITY] C5 — Legacy vault renders plaintext passwords into DOM attributes
- **File:** `app/vault.js:475`
- **Detail:** `<span class="password-value hidden" data-password="${this.escapeHtml(entry.password)}">` — the actual password is stored in a DOM attribute of the live page (escaped for XSS, but *present*). `lock()` also retains plaintext entries in memory rather than nulling them.
- **Red-team impact:** Any XSS in the page, any browser extension, devtools, or screen-sharing/shoulder-surfing with devtools open can read every password. The "hidden" class is display-only.
- **Fix:** This file is dead (I1) — delete it. If any UI keeps a reveal feature, render the plaintext only for the single entry being revealed, clear it on blur/lock, and never keep it in an attribute.

### [HIGH] [SECURITY] C6 — `window.open` without `noopener` (reverse tabnabbing)
- **File:** `app/components/vault/components/vault-view.js`
- **Detail:** Entry URLs are opened with `window.open(url)` with no `noopener,noreferrer` feature string and no URL-scheme validation.
- **Red-team impact:** The opened page's `window.opener` lets a malicious site drive the vault tab (navigate it, phish on its origin). A stored entry URL of `javascript:…` or a scheme-confused value is unvalidated.
- **Fix:** `window.open(url, '_blank', 'noopener,noreferrer')` plus a scheme allow-list (`https:` only for user-supplied URLs).

### [HIGH] [SECURITY] C7 — No Content-Security-Policy on any HTML page
- **File:** `app/index.html`, `app/vault.html`, `app/debug.html`, `app/test.html`
- **Detail:** None of the four pages carries a CSP meta tag.
- **Red-team impact:** With zero CSP, any single XSS primitive (see the XSS surface in S1) is immediately usable for full script injection, data exfiltration, and DOM tampering. CSP would be the last line of defense for a password manager.
- **Fix:** Add a strict CSP meta tag per page (`default-src 'self'`; `style-src 'self' 'unsafe-inline'` only if required; no `connect-src` to remote hosts — which also kills C8).

### [HIGH] [SECURITY] C8 — External Google Fonts import in a zero-dependency project
- **File:** `app/test.html:33`
- **Detail:** `@import url('https://fonts.googleapis.com/css2?family=Inter…&family=JetBrains+Mono…')` — the only external network call in the codebase.
- **Red-team impact:** Network/supply-chain dependency (MITM or compromised font CSS can execute script if CSP is absent — see C7), user-IP/usage metadata leakage to Google, and total breakage of offline use for a tool that should work from a single directory.
- **Fix:** Delete the import (system font stack) or self-host the font files under `app/`.

### [HIGH] C9 — `F5.embedContainer` returns three inconsistent shapes
- **File:** `src/information-theory/steganography/f5-syndrome.js`
- **Detail:** Returns `false` on some failure paths, `{ success: false, error }` on others, and `null` on others — while callers expect the project's universal `[value, error]` Result tuple.
- **Impact:** Callers must guess which shape they got; a `false` return treated as truthy-check passes silently, and a `null` return crashes destructuring. Contract violation (spec rule: Result tuples everywhere).
- **Fix:** Return `[container, error]` uniformly; make every failure path produce an error tuple.

### [HIGH] C10 — `batch-embedder` throws instead of returning an error tuple
- **File:** `src/information-theory/steganography/batch-embedder.js`
- **Detail:** `if (decodeErr) throw decodeErr;` — breaks the Result-tuple contract and violates rule #6 (no try/catch / throw in business logic).
- **Impact:** A mid-batch decode failure takes down the whole embed with an uncaught exception instead of a recoverable error tuple; UI callers without try/catch show a white-screen error.
- **Fix:** `return [null, decodeErr];`

### [HIGH] C11 — `batch-extractor.extract` returns a bare `null` (three inconsistent shapes)
- **File:** `src/information-theory/steganography/batch-extractor.js`
- **Detail:** The reassemble-error branch returns bare `null` while other paths return tuples or objects.
- **Impact:** `const [vault, err] = await extract(...)` on the `null` path throws `TypeError: null is not iterable` — the failure mode is a crash *about* a failure, losing the original error entirely.
- **Fix:** All paths return `[value, error]`.

### [HIGH] C12 — `batch-extractor` returns mock metadata and a hardcoded filename
- **File:** `src/information-theory/steganography/batch-extractor.js`
- **Detail:** After successful reassembly, the extractor fabricates placeholder metadata and returns a constant filename (`'vault.json'`), discarding the real per-chunk `secretMetadata` carried inside each image.
- **Impact:** Silent data corruption of vault metadata: tags, creation dates, and the original filename are lost on every multi-image restore. The user gets a "restored" vault that is silently wrong.
- **Fix:** Rehydrate metadata from the first chunk's header; verify all chunks agree; return the real filename.

### [HIGH] C13 — `new Blob([jpegBytes.buffer])` without `.slice(0)` → corrupted download
- **File:** `app/components/encoder-ui.js:72`
- **Detail:** The Blob wraps the *entire underlying ArrayBuffer* of the returned bytes. If `encoder.encode()` ever returns a subarray view (e.g., after trimming a capacity buffer), the downloaded "JPEG" contains trailing garbage and is corrupt.
- **Impact:** Data corruption on the primary user action (saving a secret photo). Currently latent only because the encoder happens to return a tight buffer — a fragile invariant nothing enforces.
- **Fix:** `new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], { type: 'image/jpeg' })` or simply `new Blob([bytes])` after `Uint8Array.prototype.slice` copy.

### [HIGH] C14 — Legacy `load()` does not check the Result tuple
- **File:** `app/vault.js` (`load()` path)
- **Detail:** Reads `result.data` from a `[value, error]` tuple without checking `error`; on a failed load it crashes on `undefined.data`.
- **Impact:** Corrupted/locked vault files produce a JS crash instead of the intended "could not open" message. (File is dead — I1 — but the pattern is a contract violation to cite when the file is deleted.)
- **Fix:** Delete with the file (I1); if resurrected, destructure and check `err` first.

### [MEDIUM] [SECURITY] C15 — Per-chunk checksums are computed and carried, but never verified
- **File:** `src/information-theory/steganography/batch-extractor.js`, `src/information-theory/steganography/chunk-manager.js`
- **Detail:** Each chunk carries a 32-bit additive checksum that is computed at embed time and transported through the container — but the reassembly path never compares it against the reassembled payload.
- **Impact:** A partially-corrupt chunk (bit flips that ECC does *not* fully correct, or a host that mangles bytes) can pass reassembly and yield a silently corrupted vault. The checksum's entire purpose is defeated.
- **Fix:** Verify each chunk checksum before reassembly; fail with the chunk index on mismatch.

### [MEDIUM] C16 — No CRC re-validation after Reed-Solomon recovery
- **File:** `src/information-theory/steganography/jsteg.js`, `src/information-theory/steganography/f5-syndrome.js` (`extractContainer` paths)
- **Detail:** In the unencrypted+ECC path, the payload CRC32 is checked *before* RS decode; after RS corrects errors the recovered bytes are accepted without re-checking the CRC.
- **Impact:** RS can "correct" a stream into a different-but-plausible byte sequence (error floor behavior); without a post-recovery CRC check the vault silently decrypts garbage or passes as a different payload.
- **Fix:** Re-run CRC32 on the recovered bytes and fail loudly on mismatch.

### [MEDIUM] C17 — `cryptoInstance` null-async race
- **File:** `src/structures/vault/immutable-vault.js:196`, `src/information-theory/steganography/chunk-manager.js:90`
- **Detail:** Both call `cryptoInstance.randomUUID()` on the shared compat shim whose instance is populated asynchronously (dynamic `import('crypto').webcrypto` fallback). A call before the promise resolves dereferences `null`.
- **Impact:** In Node environments the first ID generation can throw `TypeError: Cannot read properties of null`. Latent in browsers (WebCrypto is synchronous) but the shim's contract is "async-ready" with no readiness gate.
- **Fix:** Expose `ensureCrypto(): Promise<Crypto>` in `crypto-compat.js` and await it before first use; or make the export a `Proxy` that awaits internally.

### [MEDIUM] C18 — `save()` throws on embed error, breaking the tuple contract
- **File:** `src/structures/vault/immutable-vault.js`
- **Detail:** `if (embedErr) throw embedErr;` inside an async method that otherwise returns tuples.
- **Impact:** UI callers written against the tuple contract miss this path; a failed embed surfaces as an unhandled promise rejection instead of an error tuple.
- **Fix:** `return [null, embedErr];`

### [MEDIUM] C19 — `static fromJSON` lacks null-guard on `data.metadata`
- **File:** `src/structures/vault/immutable-vault.js`
- **Detail:** Destructures `data.metadata` without checking for `undefined`; a hand-edited or truncated JSON file crashes deserialization.
- **Impact:** A vault file with a missing metadata block is unrecoverable with a crash instead of a clean validation error.
- **Fix:** Validate the JSON shape (metadata present, version known, entries is an array) before use; return an error tuple on any miss.

### [MEDIUM] C20 — `SecureEntry.fromJSON` performs no field validation; `decrypt` iterates possibly-undefined tags
- **File:** `src/structures/vault/secure-record.js`
- **Detail:** Fields are assigned verbatim from JSON; `decrypt` does `[...this.tags]` which throws if `tags` is absent.
- **Impact:** One malformed entry in an imported file takes down the whole vault load.
- **Fix:** Validate required fields in `fromJSON`; default `tags` to `[]`.

### [MEDIUM] C21 — `F5.extractRaw` legacy `k`-fallback mismatches post-shrinkage k
- **File:** `src/information-theory/steganography/f5-syndrome.js`
- **Detail:** When the embedded header's k differs from the current shrinkage-adjusted k, the fallback path re-reads with the stale k, desynchronizing the coefficient walk.
- **Impact:** Images embedded before a shrinkage change can be read with the wrong chunk width → silent garbage extraction.
- **Fix:** Always honor the k stored in the container header; drop the fallback or make it a hard error.

### [MEDIUM] C22 — `extractContainer` tolerates storedK ≠ usedK with a `console.warn`
- **File:** `src/information-theory/steganography/f5-syndrome.js`
- **Detail:** A k mismatch between header and extraction is downgraded to a warning; extraction proceeds with the wrong assumptions.
- **Impact:** Silent mis-extraction for a class of images that should fail fast.
- **Fix:** Treat the mismatch as an error tuple.

### [MEDIUM] C23 — `Jsteg.embedContainer` returns `false` / `null` / boolean inconsistently
- **File:** `src/information-theory/steganography/jsteg.js`
- **Detail:** Same class of contract violation as C9/C10: mixed return shapes across failure modes.
- **Impact:** Callers cannot uniformly distinguish "too small" from "internal error" from "success with warnings."
- **Fix:** Unify to `[value, error]`.

### [MEDIUM] C24 — `batch-extractor` swallows per-file decode errors
- **File:** `src/information-theory/steganography/batch-extractor.js`
- **Detail:** Per-file failures are caught and `continue`d; the batch result reports success with a partial, silently-incomplete vault.
- **Impact:** A 3-of-5 chunk set can "succeed" with 2 chunks of data missing; the user believes they restored everything.
- **Fix:** Collect per-file errors and return them in the tuple's error slot (partial results + explicit error listing the skipped files).

### [MEDIUM] C25 — `debug.html` imports a file that does not exist
- **File:** `app/debug.html:26`
- **Detail:** `import('../src/jpeg-encoder.js')` — there is no `src/jpeg-encoder.js` (the encoder lives at `src/codec/encoder.js`). The page is guaranteed to fail on load.
- **Impact:** Anyone opening the debug page gets a blank console error; it also violates rule #9 (dead/broken code in the tree).
- **Fix:** Point it at the real module or delete the page (see I6).

### [MEDIUM] C26 — Drop zone truncates directory listings at 100 entries
- **File:** `app/components/vault/components/drop-zone.js`
- **Detail:** `DirectoryReader.readEntries` is called once via `readEntriesPromise`; per the spec, a single call returns at most 100 entries.
- **Impact:** A folder with >100 images silently embeds only the first 100 — a backup that looks complete but is not.
- **Fix:** Loop `readEntries` until it returns an empty array, accumulating all entries.

### [MEDIUM] C27 — `importData` parses user JSON with no per-field validation
- **File:** `app/components/vault/vault-ui.js`
- **Detail:** Only checks that `data.entries` is an array; no per-field checks, no bound on entry count.
- **Impact:** A malicious or corrupted import file can inject entries with arbitrary field shapes (or a 10MB entries array), corrupting vault state or freezing the UI.
- **Fix:** Validate each entry's fields against the SecureEntry schema; cap import size.

### [MEDIUM] C28 — `copyPassword` alerts success unconditionally
- **File:** `app/components/vault/vault-ui.js`
- **Detail:** `navigator.clipboard.writeText` is not awaited and the success alert fires regardless of the promise outcome.
- **Impact:** User believes the password is on the clipboard when the write failed (permissions, focus) — they then paste "nothing" into a login form.
- **Fix:** `await` the write and branch the alert on success/failure.

### [MEDIUM] C29 — Encoder UI does not check the `encode()` Result tuple
- **File:** `app/components/encoder-ui.js`
- **Detail:** `decoder-ui.js` handles its tuple correctly (`if (err) throw err;`) but the encoder path does not — inconsistent handling of the same contract.
- **Impact:** Encoder failures surface as cryptic downstream errors (e.g., C13's Blob path running on undefined).
- **Fix:** Destructure and check the error before touching `jpegBytes`.

### [MEDIUM] C30 — UI calls the vault's private `_getSessionKey()`
- **File:** `app/components/vault/vault-ui.js` (`editEntry`, `copyPassword`)
- **Detail:** UI code reaches into a private method of the vault object to obtain the session key directly.
- **Impact:** Encapsulation breach: the key is now reachable from any script with a vault reference, and any change to key derivation silently breaks the UI.
- **Fix:** Expose purpose-specific public methods (`vault.encryptEntry(plain)`, `vault.decryptEntry(cipher)`); keep key material internal.

### [MEDIUM] C31 — Reed-Solomon codec mutates its inputs in place
- **File:** `src/information-theory/error-correction/reed-solomon-codec.js`
- **Detail:** `encode`/`decode` write into the caller's buffers with no documented mutation contract.
- **Impact:** Any caller passing a shared/reused buffer (e.g., a capacity-scanned estimate buffer) gets silently clobbered state — a classic source of heisenbugs.
- **Fix:** Document the mutation explicitly or copy inputs on entry; prefer returning fresh buffers.

### [MEDIUM] C32 — `rs-interleaver` returns inconsistent shapes between modes
- **File:** `src/information-theory/error-correction/rs-interleaver.js`
- **Detail:** Profile mode returns a Result tuple; legacy mode returns a bare `Uint8Array`. The JSDoc omits the tuple entirely.
- **Impact:** Callers written to one mode crash or mis-destructure in the other.
- **Fix:** One return shape; update JSDoc to match.

### [MEDIUM] C33 — `extractContainer` logs corrupted metadata to the console
- **File:** `src/information-theory/steganography/f5-syndrome.js`
- **Detail:** On metadata corruption the code `console.error`s the decoded (possibly sensitive) metadata.
- **Impact:** In a browser, corrupted-but-real secrets leak into the devtools console (persisted to disk in some profiles) and to any console-logging extension.
- **Fix:** Log only the error class and offsets, never payload bytes.

### [LOW] C34 — Jsteg LSB asymmetry at |val| = 1 relies on positional-walk consistency
- **File:** `src/information-theory/steganography/jsteg.js`
- **Detail:** The ±1 → ±2/±3 remapping is asymmetric; correctness depends on embed and extract walking the *identical* coefficient sequence, including the DC-skip and category-aware decisions.
- **Impact:** Latent, but any future divergence between the two walkers (e.g., one gains an optimization) corrupts data with no checksum-visible signal (see C16).
- **Fix:** Add a round-trip PBT that asserts embed/extract coefficient-walk equivalence, not just payload equality.

---

## 2. Style and Consistency

### [MEDIUM] S1 — Four duplicated HTML-escape implementations, no shared utility
- **Files:** `app/components/vault/modal-manager.js`, `app/components/vault/components/vault-view.js`, `app/components/vault/vault-ui.js`, `app/vault.js`
- **Detail:** Every component that touches `innerHTML` defines its own `escape()` (`String(str).replace(& < > " ')` — four copies, no shared helper.
- **Impact:** Four places to audit for the same security-critical primitive; the next developer adding a fifth surface will inevitably write a sixth variant with a missed entity. All four current copies are XSS-safe (verified), but the DRY violation is the risk.
- **Fix:** One `app/components/escape.js` exporting `escapeHtml`; import everywhere.

### [MEDIUM] S2 — JSDoc gaps and a wrong `@returns` in crypto/container layer
- **Files:** `src/information-theory/cryptography/crypto-compat.js` (no JSDoc; `Crypto | Promise` union undocumented), `src/information-theory/steganography/payload-container.js` (`ContainerFormat` `@returns` describes the wrong type)
- **Impact:** The compat shim's async-ambiguity (root cause of C17) is invisible to readers precisely because it is undocumented.
- **Fix:** Full JSDoc on the shim including readiness semantics; correct the `@returns` tag.

### [MEDIUM] S3 — Duplicate/stacked JSDoc blocks in `jsteg.js`
- **File:** `src/information-theory/steganography/jsteg.js`
- **Detail:** Several methods carry two stacked JSDoc blocks (one stale) — the stale one actively contradicts the live behavior.
- **Impact:** Readers trust the first (wrong) block.
- **Fix:** Delete the stale blocks.

### [MEDIUM] S4 — No JSDoc in the ECC core; Java-style error messages
- **Files:** `src/information-theory/error-correction/reed-solomon-codec.js`, `src/information-theory/error-correction/galois-field.js`
- **Impact:** Violates the project's "JSDoc on all functions" convention; error strings are ported verbatim from the zxing Java original, leaking implementation origin and hurting debuggability.
- **Fix:** Add JSDoc; rewrite messages in the project's style.

### [MEDIUM] S5 — UI components lack JSDoc entirely
- **Files:** `app/components/encoder-ui.js`, `app/components/decoder-ui.js`, `app/components/vault/components/drop-zone.js`
- **Impact:** Inconsistent with the rest of the codebase (which documents everything); contributors must read implementation to learn method contracts.
- **Fix:** Add JSDoc to all public methods.

### [MEDIUM] S6 — try/catch in crypto layer vs rule #6
- **File:** `src/information-theory/cryptography/` (multiple)
- **Detail:** Rule #6 prohibits try/catch in business logic, yet the crypto modules use it to normalize WebCrypto rejections into error values.
- **Impact:** The convention is either wrong or inconsistently enforced — reviewers cannot tell which.
- **Fix:** Either carve out an explicit "system boundary" exception in the spec (crypto is the boundary) or move normalization to the callers; document the decision.

### [MEDIUM] S7 — Sync/async API inconsistency
- **Files:** across `src/information-theory/`
- **Detail:** Some operations (e.g., CRC, RS) are sync, others (AES, PBKDF2, extraction) async, and the container APIs mix both without a documented rule.
- **Impact:** Callers must memorize which surface is awaitable; the C17 race is a direct consequence.
- **Fix:** Document the boundary: pure math = sync, WebCrypto = async; keep it that way.

### [MEDIUM] S8 — Non-standard MIME type `'image/jpg'`
- **Files:** `app/components/encoder-ui.js` (and related download paths)
- **Impact:** `image/jpg` is a historical alias; `image/jpeg` is the IANA type. Non-standard types can be rejected or mis-routed by strict hosts — a problem for the planned public-upload feature.
- **Fix:** Use `image/jpeg` everywhere.

### [MEDIUM] S9 — `console.*` noise throughout the stego/crypto core
- **Files:** `src/information-theory/steganography/f5-syndrome.js`, `batch-embedder.js`, `app/components/vault/vault-ui.js`, `app/components/decoder-ui.js`, `app/components/encoder-ui.js`, `app/vault.js`
- **Detail:** Debug `console.log`s (per-iteration, per-selection, per-step) in production paths.
- **Impact:** Performance drag on large batches; leaks internal state (and in C33, secrets) to the console.
- **Fix:** Remove, or gate behind a single debug flag.

### [MEDIUM] S10 — Magic numbers and hardcoded constants in UI
- **Files:** `app/components/encoder-ui.js` (quality `90`, sampling label `'4:4:4'` while the actual pipeline is 4:2:0, `setTimeout(r, 10)`), `app/components/decoder-ui.js` (magic 10ms), `app/components/vault/modal-manager.js` (50ms), `app/test.html` (`const estimated = 480;` vs the actual 515 tests)
- **Impact:** The `4:4:4` label is factually wrong (misleads the user about compression); the stale test estimate understates progress; magic timing values are unexplained.
- **Fix:** Named constants with one-line rationale; compute the test estimate or remove it; fix the sampling label.

### [MEDIUM] S11 — Two parallel vault implementations
- **Files:** `app/vault.js` (self-contained legacy, metadata `'1.0'`, native prompt/alert) vs `app/components/vault/vault-ui.js` + `ModalManager` + `VaultView` + `SecureEntry` (modular, metadata `'2.0'`, File System Access API)
- **Impact:** Only the modular stack is loaded by `vault.html`; the legacy file is dead (I1) but its parallel feature set (different save mechanisms, different metadata version) will confuse future readers and test writers.
- **Fix:** Delete the legacy file (I1) and keep `'2.0'` as the single format.

### [MEDIUM] S12 — Two/three parallel steganographic container formats
- **Files:** `src/information-theory/steganography/f5-syndrome.js` (`F5SG`), `jsteg.js` (inline `JSTG`), `payload-container.js` (`ContainerFormat` `JSTG`)
- **Impact:** `ContainerFormat` is runtime-orphaned (nothing instantiates it in the live path); three "JSTG" definitions diverge in flags/checksum handling.
- **Fix:** Pick one container definition per engine; delete the orphan (rule #9).

### [MEDIUM] S13 — Duplicated `specs/` directories, byte-identical, with a space in the directory name
- **Files:** `src/specs/` (duplicated)
- **Impact:** The space in the path is a portability hazard (shell, tooling, CI); the duplication means edits to one copy silently diverge from the other.
- **Fix:** Single canonical `specs/` dir, rename to `src/specs` (no space); delete the duplicate.

### [LOW] S14 — Root-level stray artifacts
- **Files:** `test-output.txt`, `test-run-output.txt`, `code-concat-for-perplexity-test.ps1` + `codebase_corpus.txt` (both duplicated under `scripts/`)
- **Impact:** Test outputs committed at the repo root; the root/`scripts` duplication is an accidental fork.
- **Fix:** Add outputs to `.gitignore`; keep the scripts in `scripts/` only.

### [LOW] S15 — `test.html` progress estimate hardcoded at 480
- **File:** `app/test.html`
- **Impact:** Progress bar tops out at ~93% forever; misleads anyone watching a browser run.
- **Fix:** Derive the total from the registered suite count.

### [LOW] S16 — Modal component nits
- **File:** `app/components/vault/modal-manager.js`
- **Detail:** Enter/Escape shortcuts wired only for `prompt` (not `confirm`); hardcoded `<h3>Confirmation</h3>` instead of a parameter; a pointless `class`-attribute escape (attribute is a constant string).
- **Fix:** Parameterize the header; wire keys for both modal kinds; drop the no-op escape.

### [LOW] S17 — `sortEntries` uses `id.localeCompare` as a tie-breaker
- **File:** `app/components/vault/vault-ui.js`
- **Impact:** Sorting by a random UUID's lexicographic order is semantically meaningless; it masks the fact that no stable secondary key was chosen.
- **Fix:** Use creation timestamp or an explicit stable order.

### [LOW] S18 — `showLoading` queries a `<p>` without null-check
- **File:** `app/components/vault/vault-ui.js`
- **Impact:** Throws if the loading element is absent (e.g., after a partial DOM refactor).
- **Fix:** Guard the query.

### [LOW] S19 — `unlocked = !!this.vault.masterPassword` contradicts `isUnlocked`
- **File:** `app/components/vault/vault-ui.js`
- **Impact:** Two sources of truth for "unlocked"; the comment admits it is a "simple check." They will drift.
- **Fix:** Single `isUnlocked()` accessor.

### [LOW] S20 — Decoder UI: `decode-status` vs `status` naming
- **File:** `app/components/decoder-ui.js`
- **Impact:** Two near-identical element ids/variables for one concept.
- **Fix:** One name.

### [LOW] S21 — `?v=debug` cache-buster on `main.js` in production HTML
- **File:** `app/index.html`
- **Impact:** Dev artifact in the shipping page; defeats caching in a way that hints at an unfinished release process.
- **Fix:** Remove or make it a build step.

### [LOW] S22 — Page-relative icon paths in ModalManager
- **File:** `app/components/vault/modal-manager.js`
- **Impact:** Icons break if the component is ever served from a different base path.
- **Fix:** Resolve against a known asset root.

### [LOW] S23 — `getIcon()` returns a constant `'🔑'`
- **File:** `app/components/vault/components/vault-view.js`
- **Impact:** A method whose only behavior is a constant (rule #9 smell).
- **Fix:** Inline the constant or make it data-driven.

### [LOW] S24 — `node` listed as a devDependency
- **File:** `package.json`
- **Impact:** Pinning the runtime as a dependency is anomalous (it is the environment, not a package) and can break `npm ci` on mismatched Node versions.
- **Fix:** Remove; use `engines` + `.nvmrc` if a version pin is wanted.

### [LOW] S25 — Rambling, self-debating, and commented-out code
- **Files:** `f5-syndrome.js` (multi-paragraph "self-debate" comment in `extractAuto`; commented-out `console.warn` in `extract`), `jsteg.js` (top-of-file rambling comment)
- **Impact:** Multi-paragraph narrative comments are the highest-cognitive-load content in the codebase; they document decisions that should live in a commit message or spec, not inline.
- **Fix:** Reduce to one line each, or move to `specs/`.

---

## 3. Idiomatic Improvements

### [HIGH] I1 — Dead legacy `app/vault.js` (rule #9 violation) with a live test coupling
- **File:** `app/vault.js` (entire file)
- **Detail:** No HTML loads it; its element IDs exist in no live page. However, `test/security/ui-legacy-xss.test.js:15` does `fs.readFileSync('…app/vault.js')` and `new Function`s the extracted `escapeHtml` (line 18) — the dead file has a *live* test dependency.
- **Impact:** The largest single maintainability hazard in the repo: ~500 lines of a parallel, worse implementation (plaintext in DOM — C5, native prompts, Blob downloads) that still receives "coverage" from a fragile source-extraction test (sec3/sec4 findings, I21).
- **Fix (ordered):** (1) port the escape-test to the *modular* `vault-ui.js`/`modal-manager.js` escape; (2) delete the browser-skip branch; (3) delete `app/vault.js`.

### [MEDIUM] I2 — Dead method: `BatchEmbedder.estimateCapacity`
- **File:** `src/information-theory/steganography/batch-embedder.js:248`
- **Detail:** Zero callers anywhere in `src/`, `app/`, or `test/` (verified by grep — the sole occurrence is the definition).
- **Impact:** Rule #9 (dead-code ban). Misleads readers into thinking capacity estimation is part of the batch flow.
- **Fix:** Delete, or wire it into the UI (see F11 — it becomes a feature).

### [MEDIUM] I3 — Dead exports: `Jsteg.getCategory` and `F5Reader`
- **Files:** `src/information-theory/steganography/jsteg.js:44`, `src/information-theory/steganography/f5-syndrome.js:850`
- **Detail:** `getCategory` has no callers; `F5Reader` is defined and exported but never instantiated.
- **Impact:** Rule #9; exported-but-unused API surface is an invitation to divergent maintenance.
- **Fix:** Delete both (tests first if any — currently none).

### [MEDIUM] I4 — `reedsolomon.js` is a 16-line re-export shim
- **File:** `src/information-theory/error-correction/reedsolomon.js`
- **Detail:** Re-exports `reed-solomon-codec.js` symbols (including the dead GF constants at lines 11/13/15) with no logic. `error-correction/index.js` re-exports them again.
- **Impact:** Three layers of indirection to reach the real implementation; rule #9 smell.
- **Fix:** Import directly from `reed-solomon-codec.js`; delete the shim.

### [MEDIUM] I5 — Dead Galois-field constants and aliases
- **File:** `src/information-theory/error-correction/galois-field.js:312-316`
- **Detail:** `GenericGF_AZTEC_PARAM` (312), `GenericGF_DATA_MATRIX_FIELD_256` (314), `GenericGF_AZTEC_DATA_8` (315, alias), `GenericGF_MAXICODE_FIELD_64` (316, alias) are defined and re-exported but never consumed in production (only the QR field is used).
- **Impact:** Rule #9; ported constants from the zxing original that this project never uses.
- **Fix:** Delete the unused fields/aliases and their re-exports.

### [MEDIUM] I6 — Broken debug page
- **File:** `app/debug.html`
- **Detail:** Imports non-existent `../src/jpeg-encoder.js` (C25); the page cannot function.
- **Fix:** Repair the import path if the debug surface has value; otherwise delete.

### [MEDIUM] I7 — Parameter mutation despite `Object.freeze`
- **File:** `src/structures/vault/immutable-vault.js` (`addEntry`)
- **Detail:** The frozen vault object is protected, but `addEntry` mutates a parameter's internal state in place as part of the "immutable" update.
- **Impact:** The freeze gives a false sense of immutability; callers passing shared objects observe surprise mutation.
- **Fix:** Copy-then-freeze internally; document that inputs are not mutated.

### [MEDIUM] I8 — Unguarded `e.tags.includes(tag)` in search
- **File:** `src/structures/vault/immutable-vault.js` (`search`)
- **Impact:** A malformed entry without `tags` (see C20) turns a search into a crash.
- **Fix:** `(e.tags ?? []).includes(tag)`.

### [MEDIUM] I9 — `embedContainer` mutates caller metadata
- **Files:** `src/information-theory/steganography/f5-syndrome.js`, `jsteg.js`
- **Impact:** Callers that reuse a metadata object across embeds get corrupted state; violates the "pure codec" expectation of the algebraic/codec layers.
- **Fix:** Clone metadata before mutation.

### [MEDIUM] I10 — Static method-state globals in decoder UI
- **File:** `app/components/decoder-ui.js`
- **Detail:** `HuffmanTable.setDecodeMethod` / `BitReader.setMode` — configuration stored on class constructors, shared across all instances and all decode calls.
- **Impact:** Global mutable state is a concurrency/reentrancy trap (two decodes in flight = cross-talk) and breaks any future parallel decoding.
- **Fix:** Pass mode as a constructor/argument value.

### [MEDIUM] I11 — Security-test suite is structurally weak
- **Files:** `test/security/xss.test.js`, `test/security/ui-legacy-xss.test.js`, `test/security/secure-id-generation.test.js`
- **Detail:**
  - `xss.test.js`: covers only the prompt *title* `<h3>` context; no body-context, quote-escaping, or other-component coverage; a dangling promise (`const promise` never awaited); an unused `expect` import; an unbounded `Arbitrary.string` (rule #13 violation).
  - `ui-legacy-xss.test.js`: extracts `escapeHtml` via a regex that stops at the first `}` and `new Function`s it; in the browser runner the `else { return; }` branch performs **zero assertions** — a silent skip that inflates the 515 pass count.
  - `secure-id-generation.test.js`: monkey-patches `Math.random` without `try/finally` (leaks the patch if the target throws) and only proves direct `Math.random` absence, not that `crypto.randomUUID` is actually used.
- **Impact:** The "security" category of the suite provides far less assurance than its name suggests, and the browser run is false-green.
- **Fix:** Assert on the modular components' escape in both title *and* body contexts; bound generators (rule #13); replace source-extraction with direct imports; make the browser path assert, not skip; wrap the patch in `try/finally`; assert on the actual UUID source.

### [MEDIUM] I12 — `test/scripts/` mixes one-off debug scripts with real suites
- **Files:** `test/scripts/*`
- **Detail:** Only ~3 files (`auto_detection_roundtrip`, `capacity_validation`, `format_detection`) are real suites loaded by `test.html`; the rest are one-off debug scripts that violate rule #9.
- **Fix:** Delete or move the one-offs; keep the three suites.

### [LOW] I13 — `jsteg` `FLAGS` enum defined but always 0
- **File:** `src/information-theory/steganography/jsteg.js`
- **Impact:** Dead enum surface (rule #9).
- **Fix:** Remove or use it (encryption flag — see F5).

### [LOW] I14 — `jsteg` embedRaw branches for |val| = 1 and 2 are identical
- **File:** `src/information-theory/steganography/jsteg.js`
- **Impact:** Duplicate code; one of the branches is a copy-paste artifact.
- **Fix:** Collapse to one branch.

### [LOW] I15 — Unbounded `buildGenerator` cache
- **File:** `src/information-theory/error-correction/reed-solomon-codec.js`
- **Impact:** Cache grows with distinct (field, degree) pairs — bounded in practice for this project, but unbounded by construction.
- **Fix:** Note the bound in a comment, or LRU-cap it.

### [LOW] I16 — Galois-field constant aliasing
- **File:** `src/information-theory/error-correction/galois-field.js:315-316`
- **Impact:** `AZTEC_DATA_8 = DATA_MATRIX_FIELD_256` and `MAXICODE_FIELD_64 = AZTEC_DATA_6` — aliasing two names for one object invites accidental "independent" use. Moot if I5 deletes them.
- **Fix:** Delete (I5) or rename to make aliasing explicit.

### [LOW] I17 — Modulo bias in `generatePermutation`
- **File:** `src/information-theory/steganography/f5-syndrome.js`
- **Detail:** Fisher-Yates with an LCG PRNG using modulo — introduces low-order-bit bias in the permutation.
- **Impact:** Cryptographically irrelevant (the permutation is keyed by the password and the payload is AES-encrypted), but it is a correctness nit for the "random" claim.
- **Fix:** Rejection sampling, or document that uniformity is not required.

### [LOW] I18 — `createObjectURL` never revoked
- **File:** `app/components/encoder-ui.js`
- **Impact:** Small memory leak per encode in long sessions.
- **Fix:** `URL.revokeObjectURL` after the download click.

### [LOW] I19 — Drop-zone nits
- **File:** `app/components/vault/components/drop-zone.js`
- **Detail:** Mixed `File`/`FileSystemFileHandle` return types (dz2); non-deterministic directory order (dz3); unbounded recursion depth for nested dirs (dz4); sequential `getAsFileSystemHandle` awaits (dz6); no JSDoc (dz5).
- **Fix:** Normalize types, sort entries by name, cap recursion, parallelize handle fetches.

### [LOW] I20 — Legacy vault UX patterns (for the deletion record)
- **File:** `app/vault.js`
- **Detail:** Full `innerHTML` re-render per keystroke (v7); native `prompt()` for entry input (v4); Blob-download save with no confirmation (v5).
- **Impact:** Moot once deleted (I1); listed so the modular stack is not accused of these later.

### [LOW] I21 — `ModalManager` 50ms `setTimeout` to resolve
- **File:** `app/components/vault/modal-manager.js`
- **Impact:** Arbitrary latency on every modal resolve; makes tests flaky and UX sluggish.
- **Fix:** Resolve synchronously after DOM update (or `requestAnimationFrame`).

### [LOW] I22 — Test-only public API in `rs-interleaver`
- **File:** `src/information-theory/error-correction/rs-interleaver.js:257,270`
- **Detail:** `getOverheadMultiplier` / `calculateEncodedSize` are consumed only by tests.
- **Impact:** Public surface exists to serve the test suite.
- **Fix:** Acceptable if documented as "exposed for testing"; otherwise move to `test/utils`.

### [LOW] I23 — One-off scripts duplicated at repo root
- **Files:** `code-concat-for-perplexity-test.ps1`, `codebase_corpus.txt` (root + `scripts/`)
- **Impact:** Duplication (see S14) plus rule #9 for the corpus artifact.
- **Fix:** Keep in `scripts/` only; gitignore generated corpora.

---

## 4. Feature Ideas

Open-ended, prioritized by value-to-risk for the stated roadmap (public image-host backups):

1. **Public-host upload tools (the planned feature) with round-trip integrity verification.** Most image hosts re-encode JPEGs on upload (imgur-style pipelines transcode, strip metadata, resize). A stego backup uploaded to such a host is *destroyed at rest*. The upload tool must: (a) download the public URL immediately after upload, (b) extract the payload, (c) compare CRC — and refuse to mark the backup "live" until the round trip is verified. Host support should be an adapter matrix (host, re-encode behavior, max size, TOS on binary-in-image) rather than a generic uploader.
2. **Backup-set manifest.** An index (stego-embedded in each chunk, or a signed JSON) listing every chunk's URL + expected CRC, so a lost/reordered chunk is detectable and the set can be re-verified on demand (link-rot detection).
3. **Key wrapping to eliminate the hardcoded salt.** Wrap the session key with a vault key derived from `(masterPassword, per-vault random salt stored in header)`; on load, re-encrypt with fresh parameters (fixes C1 + C2 in one move and enables iteration-count upgrades for existing vaults).
4. **AAD binding for AES-GCM** (header + chunk index + CRC as associated data) — closes the ciphertext-migration class of attacks (C3).
5. **Post-recovery CRC re-validation + chunk-checksum verification** (C15/C16) — turn the currently-dead integrity data into a real guarantee, and surface "recovered N errors" vs "corrupt" to the user.
6. **Export hardening.** Gate `getPlaintextJSON` behind an explicit confirmation and in-memory-only lifetime (C4); add a "verified export" flow that writes plaintext to an OS-managed temp file that is zeroed/deleted.
7. **Single shared HTML-escape utility** imported by all components (S1) — and make it the *only* thing allowed to touch `innerHTML`.
8. **URL handling policy.** One `safeOpenUrl()` helper: scheme allow-list (`https:`), `noopener,noreferrer`, used by every `window.open` (C6); store-time validation of entry URLs on input.
9. **Password strength policy.** Zero-dep heuristic (length + class diversity + a small common-password list); warn (not block) on weak entries; optionally block reuse of a previous password for the same entry.
10. **Zero memory on lock.** `lock()` should null the plaintext entry fields, clear decrypted buffers, and (where possible) overwrite the arrays before GC — the vault currently retains plaintext after lock (C5 detail).
11. **Per-profile capacity estimate in the encoder UI.** Wire the dead `estimateCapacity` (I2) into the encoder: show "this photo holds ~N KB at High profile" before the user commits to a profile.
12. **CSP + offline hardening.** Strict CSP meta on all pages (C7), self-hosted fonts (C8), and a "fully offline" acceptance test (block the network in the browser runner).
13. **Deterministic batch ordering + >100-file support.** Sort directory entries by name (I19) and fix the 100-entry poll (C26) before the upload feature ships — a backup set that silently drops files is worse than none.
14. **Test-infrastructure parity.** One source of truth for the test count (fixes S15), no silent skips in the browser runner (I11), and a CI job that runs both runners and diffs their pass/fail sets.
15. **Threat-model document for public hosting.** A short spec covering: host re-encoding, link rot, host account compromise, legal seizure of a public URL, and the operational consequence that *any* public URL is eventually indexable — i.e., the master password (not the URL) must remain the only secret, which the C1/C2 fixes make true.

---

## Appendix A — Coverage Gaps (files with no meaningful test coverage)

**`src/` (library):**
| File | Coverage state |
|---|---|
| `src/automata/bit-streams/bit-writer.js` | No dedicated tests |
| `src/automata/bit-streams/bit-reader-optimized.js` | No dedicated tests |
| `src/automata/entropy-coding/huffman-optimized-fsm.js` | No dedicated tests |
| `src/information-theory/cryptography/crypto-compat.js` | No tests (C17 race untested) |
| `src/utils/crc32.js` | No dedicated tests |
| `src/main.js` | No tests |
| `src/information-theory/steganography/jsteg.js` | Only `test/scripts/test-jsteg-debug.js` (one-off debug script, not a suite) |
| `src/information-theory/steganography/batch-embedder.js` | No dedicated tests (C10/C12-class bugs live here) |
| `src/information-theory/steganography/batch-extractor.js` | No dedicated tests (C11/C12/C24 bugs live here) |
| `src/information-theory/steganography/chunk-manager.js` | Partial (via `secure-id-generation` only) |
| `src/information-theory/error-correction/reedsolomon.js` | Shim — no tests of its own (moot if deleted, I4) |

**Dead code with no tests (expected, per rule #9):** `estimateCapacity` (I2), `getCategory` (I3), `F5Reader` (I3).

**`app/` (UI):**
| File | Coverage state |
|---|---|
| `app/components/encoder-ui.js` | No tests (C13/C29 live here) |
| `app/components/decoder-ui.js` | No tests |
| `app/components/vault/components/drop-zone.js` | No tests (C26 lives here) |
| `app/components/tabs.js` | No tests |
| `app/components/vault/vault-ui.js` | No direct tests (C27/C28/C30 live here) |
| `app/components/vault/modal-manager.js` | Only the weak `xss.test.js` PBT (I11) |
| `app/components/vault/components/vault-view.js` | No tests (C6 lives here) |
| `app/vault.js` (legacy) | Only via the fragile source-extraction test (I1/I11) |

**Security-coverage gaps (no test exists for):** C1 (hardcoded salt), C2 (iteration count), C3 (AAD/IV handling), C4 (plaintext export), C15/C16 (checksum/CRC-after-recovery), C26 (>100-file truncation). The security suite currently tests *UI escaping* only — not the crypto or integrity layers that carry the actual risk.

**Runner parity gap:** the browser runner (`app/test.html`) silently skips `ui-legacy-xss.test.js` with zero assertions (I11), so the 515-test baseline is node-only in practice; a browser run reports a false-green pass count.
