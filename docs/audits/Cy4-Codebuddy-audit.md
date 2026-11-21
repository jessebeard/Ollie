# Ollie — Cy4 CodeBuddy Audit

**Date:** 2026-08-31
**Author:** CodeBuddy (fourth independent pass, ID Cy4)
**Scope:** Whole-repo review — `src/`, `app/`, `scripts/`, `test/`, `docs/`, specs, CI.
**Method:** Static reading of every layer + empirical gate runs (`npm test`,
`npm run lint`, `npm run typecheck`, `npm run fuzz --scale=1`) on the current
HEAD (`75a2024` on branch `audit/v2-remediation`). Findings are verified by
command output, not asserted from reading alone.

## Relationship to prior audits

Three prior reports live in `docs/audits/`:

| Document | Date | ID scheme |
|---|---|---|
| `CODE_REVIEW.md` | 2026-08-20 | `C1–C34`, `S1–S21` |
| `AUDIT_REPORT.md` | 2026-08-20 | `S1–S12`, `Q1–Q11`, `P1–P6`, `A1–A6` |
| `OX-Alpha-Audit-followup.md` | 2026-08-22 | `C1–C11`, `P1 cluster` |

This report does **not** re-report items still open in those documents. Where a
prior finding has been remediated since the report was written, that is called
out in §3 (Remediation Confirmations). Where a prior finding's *object* no longer
exists in the source, that is called out explicitly.

## Severity legend

| Level | Meaning |
|---|---|
| CRITICAL | Blocks the "publish carriers to public hosts" roadmap or breaks a security guarantee |
| HIGH | CI/pre-commit gate currently red, or correctness defect in a supported path |
| MEDIUM | Documentation drift that misleads, or contract weakness with realistic trigger |
| LOW | Hygiene, stale comments, or edge conditions unlikely to affect production |

## Findings index

| # | Severity | Area | Summary |
|---|---|---|---|
| Cy4-1 | HIGH | Gates | `npm run lint` reports 14 errors — CI lint step fails |
| Cy4-2 | HIGH | Gates | `npm run typecheck` reports type errors in `immutable-vault.js` |
| Cy4-3 | MEDIUM | Docs | README test count is stale (says 675; actual is 922) |
| Cy4-4 | MEDIUM | Wireframe | WIREFRAME references `src/main.js`, `app/main.js`, `app/index.html`, `app/debug.html` — none exist |
| Cy4-5 | LOW | Hygiene | Prior audit references `jsteg.js` which no longer exists in source |
| Cy4-6 | LOW | Hygiene | `test/runner.js` has no built-in single-file or filter flag |

All findings below are empirically verified at the cited HEAD.

---

## §1. Gate failures (HIGH)

### Cy4-1. `npm run lint` reports 14 errors — CI lint step is red

`CONTRIBUTING.md` §"Pre-commit gates" mandates `npm run lint # ESLint: 0 errors`
on every commit. `.github/workflows/ci.yml` runs `npm run lint` as a CI step.
At HEAD, the command exits non-zero with **14 errors** (and 98 warnings):

```
14 problems (14 errors, 98 warnings)
8 errors and 0 warnings potentially fixable with the `--fix` option.
```

Representative errors (full list reproducible via `npm run lint`):

| File:line | Rule | Detail |
|---|---|---|
| `app/components/vault/vault-ui.js:538` | no-unused-vars | `confirmInput` assigned but never used |
| `app/components/vault/vault-ui.js:532` | no-unused-vars | `reusedHandles` assigned but never used |
| `app/components/vault/vault-ui.js:893` | prefer-const | `entries` never reassigned |
| `app/components/vault/vault-ui.js:177,190` | no-undef | `performance` is not defined |
| `test/security/format-v3.test.js:385` | prefer-const | `sortedIndices` never reassigned |
| `test/security/cauchy-ec.test.js:253` | no-unused-vars | `isSingleOrLegacy` assigned but never used |
| `test/.../chunk-manager.test.js:2` | no-unused-vars | `bindChunkRecords` imported but never used |
| several `test/integration/vault/*.test.js` | prefer-const | `vault` never reassigned (6 occurrences) |

**Impact:** CI fails at the Lint step on every push until fixed. The
`prefer-const` and unused-var errors are auto-fixable with `npm run lint -- --fix`;
the `no-undef` for `performance` in `vault-ui.js` needs a globals entry (the
eslint config's `browserGlobals` does not include `performance`) or a refactor to
`performance.now()` → `Date.now()`.

**Fix:** Run `npm run lint -- --fix` to clear the 8 auto-fixable errors, then
address the 6 remaining (add `performance: 'readonly'` to `browserGlobals` in
`eslint.config.js`; delete the genuinely-unused vars). 98 warnings are permitted
(`warnings OK in test/`).

### Cy4-2. `npm run typecheck` reports type errors in `immutable-vault.js`

Same gate, same CI step. `CONTRIBUTING.md` mandates `npm run typecheck # 0 type
errors`. At HEAD, `tsc --checkJs` reports at least three errors in
`src/structures/vault/immutable-vault.js`:

```
src/structures/vault/immutable-vault.js(829,74): error TS2345:
  Argument of type 'Error | Uint8Array' is not assignable to parameter of type 'Uint8Array'.
src/structures/vault/immutable-vault.js(833,61): error TS2345:
  Argument of type 'Error | Uint8Array' is not assignable to parameter of type 'ArrayBuffer | Uint8Array'.
src/structures/vault/immutable-vault.js(845,15): error TS2488:
  Type '[PasswordVault, Error] | Promise<[PasswordVault, Error]>' must have a '[Symbol.iterator]()' method.
```

**Location:** `immutable-vault.js:829–845` — the `PasswordVault.fromExport`
static method. The code destructures result tuples (`const [saltBytes] =
base64ToBytes(k.salt)`) without narrowing the error side first. At runtime the
subsequent `deriveErr` check handles failures correctly, but TypeScript's
JSDoc inference cannot prove the tuple element is not an `Error`.

**Impact:** CI fails at the Typecheck step. This is a JSDoc annotation /
narrowing issue, not a runtime bug — but it blocks the gate.

**Fix:** Narrow each tuple destructuring before use, e.g.:
```js
const [saltBytes, saltErr] = base64ToBytes(k.salt);
if (saltErr) return [null, saltErr];
// now saltBytes is Uint8Array, not Error | Uint8Array
```
The `fromExport` method already follows this pattern for the final
`PasswordVault.fromJSON` call (line 845–846) but misses it on the three prior
`base64ToBytes` calls.

---

## §2. Documentation & wireframe drift (MEDIUM/LOW)

### Cy4-3. README test count is stale — says 675, actual is 922

`README.md` §"Quick start" and §"Testing" both cite `npm test # 675 tests`.
`README.md` §"Auditing this codebase" says `npm test (675 assertions)`. The
test-family table in §"Testing" sums to ~537. At HEAD, `npm test` reports:

```
Test Summary:
  Total:  922
  Passed: 922
  Failed: 0
```

The suite has grown substantially (QR codec, TOTP gate, CSV import, format-v3,
fuzz harness expansion, etc. per `git log`), but the README was not updated
alongside. A future auditor following the README's "675 tests" baseline would
either believe ~250 tests are failing or that the count is a typo.

**Fix:** Update README §Quick start, §Testing, §Auditing, and the test-family
table to reflect 922. Consider removing the hard-coded count entirely in favor
of "all tests green" with the count living in CI output only, so it does not
decay again.

### Cy4-4. WIREFRAME references files that do not exist

`src/specs/WIREFRAME.md` is the living architecture diagram (code-quality rule
15: "a stale wireframe is treated as dead documentation and is a defect"). At
HEAD it references four files that do not exist in the tree:

| WIREFRAME line | Referenced path | Status |
|---|---|---|
| L20 | `app/index.html` | does not exist |
| L20 | `app/debug.html` | does not exist |
| L21 | `app/main.js` ("Demo entry point") | does not exist |
| L77 (§2 mermaid) | `src/main.js` ("demo UI bootstrap") | does not exist |

Only `app/vault.html`, `app/vault.js`, and `app/test.html` exist under `app/`.
The demo encoder/decoder tabs (`encoder-ui.js`, `decoder-ui.js`, `tabs.js`)
referenced in §1 and §2 of the wireframe also do not exist under
`app/components/` — the only UI components present are
`app/components/vault/{vault-ui.js, vault.css, components/{drop-zone,modal-manager,vault-view}.js}`
plus SVG assets.

**Impact:** An auditor or contributor following the wireframe to locate the
"demo entry point" or encoder/decoder UI will find nothing. The wireframe's
§1 directory layout and §2 layer diagram both carry the stale entries.

**Fix:** Remove the `main.js` / `index.html` / `debug.html` lines from §1,
drop the `MAIN` node and `ENCUI`/`DECUI`/`tabs` nodes from §2, and verify the
remaining §2 edges still match the import graph (which correctly lists the
vault components that *do* exist). Update §3's UI-layer subgraph to match.

### Cy4-5. Prior audit references `jsteg.js` — file no longer exists (LOW)

`docs/audits/AUDIT_REPORT.md` findings S-3, S-4, and A-2 all cite
`src/information-theory/jsteg.js` (a legacy Jsteg extraction path with an
uncaught-throw else-branch). A `find src -name "jsteg*"` at HEAD returns
nothing — the file has been removed (or renamed/merged). The current
`f5-syndrome.js` is the sole stego extraction path.

**Impact:** None at runtime. The prior findings are moot for the current tree.
Noting this so a future reader of the audit trail does not hunt for a file that
is gone. Recommend the prior audit reports carry a header note that `jsteg.js`
was removed.

### Cy4-6. No single-test or filter flag in the test runner (LOW)

`test/runner.js` discovers tests by 127 static `await import(...)` lines. There
is no `--only`, `--filter`, or `--grep` mechanism; running one test file
requires either editing `runner.js` or writing a throwaway runner (see
`CODEBUDDY.md` for the pattern). `CONTRIBUTING.md` and `test-specs.md` do not
document a single-test workflow.

**Impact:** During TDD red-green cycles a developer must run the full 922-test
suite (or hand-edit the runner) to see one file's results, slowing the inner
loop. The `--scale` flag exists only on the fuzz driver.

**Fix (optional):** Add a `TEST_FILTER=foo` env var to `runner.js` that
gates each `await import(...)` on a substring match, so
`TEST_FILTER=totp npm test` runs only TOTP-related files. Low priority — the
suite is fast (~seconds) — but it would reduce friction.

---

## §3. Remediation confirmations (prior findings now resolved)

These prior-audit findings were verified as remediated in the current tree.

| Prior ID | Finding | Status at HEAD | Evidence |
|---|---|---|---|
| OX-Alpha C1 / AUDIT S-6 / CODE_REVIEW C1 | Hardcoded PBKDF2 salt `'ollie-session-salt-1234'` in `immutable-vault.js` | **Remediated** | `grep -rn "ollie-session-salt\|session-salt" src/` returns no matches. The export path (`fromExport`, L820–851) now reads salt from the per-vault base64 field `k.salt` decoded at L825, with structural validation at L820–822. |
| OX-Alpha C2 / AUDIT S-11 | Raw password used as ≤32-bit LCG seed for F5 permutation; `'F5default'` public fallback | **Remediated** | `f5-syndrome.js:41,63–70` — `resolveSeed` now derives the permutation seed from the password via `sha256("ollie/f5/permutation/v2/" || password)` (32-byte digest → 64 hex chars), domain-separated. `createPRNG` (L80–112) seeds a xoshiro128** state by FNV-1a diffusion over **all** seed bytes (not a 32-bit fold), so every seed byte contributes. Passwordless carriers use `PUBLIC_SEED = 'F5SG:v2:public'` by design — these are public-obfuscation, not secrecy. Wire format spec §2.1 (container-wire-format.md L60–66) pins this. |
| AUDIT S-3 / S-4 (jsteg legacy) | Uncaught throws in `Jsteg.extractContainer` legacy RS fallback | **Moot** | `jsteg.js` no longer exists in source (see Cy4-5). The sole extraction path is `F5.extractContainer` / `extractAuto`, which returns result tuples. |

---

## §4. Cryptographic surface review

The crypto surface remains exactly four symmetric primitives, all in
`src/information-theory/cryptography/`:

| Primitive | Module | Standard |
|---|---|---|
| AES-256-GCM | `aes-gcm.js` | FIPS 197 / NIST SP 800-38D |
| PBKDF2-HMAC-SHA-256 | `pbkdf2.js` | RFC 2898 |
| HMAC-SHA-256 | `hmac.js` | RFC 2104 |
| SHA-256 | `crypto-provider.js` (delegates to WebCrypto) | FIPS 180-4 |

`grep` for `RSA|ECC|Ed25519|ecdsa|createSign|createPublicKey` across `src/`
returns no matches. The post-quantum symmetric-only mandate
(`constitution.md`) is intact — no asymmetric primitive has been introduced.
The `REJECTED 2026-08-24` entry in `src/specs/TODO` documents that Ed25519
manifest signing was explicitly rejected on post-quantum grounds, confirming
the mandate is being enforced at design time.

`TOTP` (RFC 6238) lives in `totp.js` and is correctly treated as access control,
not encryption — the README and enrollment UI both state the TOTP gate is
weak access control, not extra encryption, with the secret inside the encrypted
vault. This matches the security model.

**DEK zeroization** is present in the fuzz suite (`fuzz.mjs` "zeroize" suite
passed: "DEK zeroization + lock hygiene checks"), confirming the
`dek.fill(0)` convention (code-quality rule, CONTRIBUTING.md) is exercised.

**KDF iteration floor** is enforced: `f5-syndrome.js:47–48` defines
`MIN_KDF_ITERATIONS = 50000` / `MAX_KDF_ITERATIONS = 10000000` as bounds on
attacker-readable container metadata, applied before any key derivation. The
README cites 600 000 iterations as the production target; the floor prevents
a forged carrier from forcing a cheap-KDF offline path.

---

## §5. Test & fuzz suite health

At HEAD, all gates that are *not* lint/typecheck pass cleanly:

| Gate | Result |
|---|---|
| `npm test` | 922 / 922 pass (0 fail) |
| `npm run fuzz -- --seed=20260823 --scale=1` | 8 / 8 suites pass (crypto, bitstreams, ecc, parsers, codec, vault, zeroize, batch) |
| Golden vectors | present and referenced by `conformance/wire-format-conformance.test.js` |

The fuzz suite is structure-aware (mutation engine in `test/fuzz/mutation-engine.mjs`,
parser workers via `worker-parse.mjs` with hang/bomb isolation) and covers all
layers per the `test/fuzz/suites.mjs` registry. The PBT harness
(`test/utils/pbt.js`) is seeded via `PBT_SEED` (CI uses `20260823`) with
automatic counterexample shrinking and a counterexample-pinning protocol
(`CONTRIBUTING.md` §"Counterexample protocol").

The only weakness in the test infrastructure is the absence of a single-test
filter (Cy4-6), which is a DX friction point, not a correctness gap.

---

## §6. Architecture observations

**Layering is clean.** The strict downward-only dependency rule
(`app → structures → information-theory → algebraic + automata → utils`) holds.
Spot-checking imports across `f5-syndrome.js`, `immutable-vault.js`,
`batch-embedder.js`, and `rs-interleaver.js` found no upward imports. The
`utils/` layer correctly contains only leaf utilities (CRC32, encoding, base32,
logger, URL safety, escape HTML, atomic writer, CSV).

**Result-tuple discipline is consistent.** Every public API spot-checked
(`PasswordVault.fromExport`, `KeyDerivation.deriveKey`, `Encryption.decrypt`,
`F5.resolveSeed`, `base64ToBytes`) returns `[value|null, error|null]`. The
typecheck errors in Cy4-2 are *narrowing* failures (not consuming the error
half before using the value half in JSDoc's view), not tuple-contract
violations. The runtime paths handle errors correctly.

**The wire format is frozen at v3** (`container-wire-format.md` L1–6), with
whole-container RS framing (coded control header + coded body). v2 containers
fail closed, requiring re-save. Golden vectors pin bit-exact behavior. Any
wire-format-visible change must regenerate vectors (`npm run vectors`) or CI's
staleness guard fails.

**Living-document artifacts** (`WIREFRAME.md`, `outline.xml`,
`test-outline.xml`) are present and detailed. The WIREFRAME carries the only
verified drift (Cy4-4); the XML outlines were not exhaustively diffed against
the file tree in this audit but should be checked in the same fix pass as
Cy4-4.

---

## §7. Recommended remediation order

1. **Cy4-1 (lint):** `npm run lint -- --fix` (clears 8/14), then add
   `performance: 'readonly'` to `browserGlobals` and delete genuinely-dead
   vars. Unblocks CI.
2. **Cy4-2 (typecheck):** Add tuple narrowing in `immutable-vault.js:825–833`
   (mirror the pattern already used at L845–846). Unblocks CI.
3. **Cy4-4 (wireframe):** Remove the four stale file references and the
   `MAIN`/`ENCUI`/`DECUI`/`tabs` nodes; realign §2 edges. Satisfies rule 15.
4. **Cy4-3 (README):** Update or remove the hard-coded `675` count.
5. **Cy4-5 / Cy4-6 (low):** Add a header note to the prior audits re: `jsteg.js`
   removal; optionally add a `TEST_FILTER` env to the runner.

Findings Cy4-1 and Cy4-2 are the only blockers — both are gate-failures visible
to CI on every push, and both are low-effort fixes.
