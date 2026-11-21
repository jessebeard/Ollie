# Contributing to Ollie

Thank you for contributing to Ollie. This document covers everything you need
to know about our conventions, workflow, and architecture.

---

## Getting oriented

The best way to understand Ollie is to read these three files in order:

1. **`src/specs/WIREFRAME.md`** — Complete mermaid.js diagram of the entire
   codebase: layers, module dependencies, runtime pipelines, wire-format stack,
   and test architecture. If you read nothing else, read this.

2. **[`src/specs/outline.xml`](src/specs/outline.xml)** and
   **[`src/specs/test-outline.xml`](src/specs/test-outline.xml)** — Per-file
   descriptions of every source module and every test file.

3. **One data-flow path end-to-end.** Pick a path (e.g., vault save → seal →
   erasure code → F5 embed → carrier) and trace it through the actual code.

The architecture is layered with strict downward dependencies:

```
app/UI → structures/vault → information-theory → algebraic + automata → utils
```

No upward imports exist anywhere in the codebase.

---

## Language conventions

- **100% vanilla JavaScript** with JSDoc type annotations. No TypeScript source.
- The optional `typecheck` script runs `tsc --checkJs` as a JSDoc linter.
- `"use strict"` or ES modules everywhere.
- 4-space indent, single quotes, semicolons.
- JSDoc on every exported function with `@param` and `@returns`.
- Result tuples `[value|null, error|null]` for all predictable failures.
  Never throw for business logic; throw only for programmer errors (invariant violations).

---

## Cryptography rules

These are non-negotiable (see `constitution.md`):

1. **Symmetric-only cryptography.** AES-256-GCM, PBKDF2-HMAC-SHA-256,
   HMAC-SHA256, SHA-256. No asymmetric primitives (RSA, ECC, Ed25519) —
   they are quantum-vulnerable and violate the post-quantum design mandate.

2. **Fail closed.** Invalid input, corruption, or tampering produces an
   explicit error tuple, never partial output or zero-filled buffers.

3. **Sensitive buffer zeroization.** DEKs and intermediate key material are
   zero-filled after use (`dek.fill(0)`).

4. **Parameter validation at trust boundaries.** Every field parsed from
   attacker-readable containers must be validated before any allocation
   or cryptographic operation.

---

## TDD workflow

We practice strict red-green-refactor:

### 🔴 RED

Write the failing tests first. Create a throwing stub for the module under
test so the suite loads but the new tests fail on assertions (not on module
load errors). Register the test file in `test/runner.js`.

```bash
node test/runner.js    # Verify: new tests FAIL, all others PASS
```

### 🟢 GREEN

Implement the minimal code to make the new tests pass.

```bash
node test/runner.js    # Verify: ALL tests PASS
```

### Refactor

Clean up while keeping green. Run the full gates before moving on.

---

## Pre-commit gates

Every commit must pass:

```bash
npm run lint           # ESLint: 0 errors (warnings OK in test/)
npm run typecheck      # tsc --checkJs: 0 type errors
node test/runner.js    # Full suite green
PBT_SEED=N node test/runner.js  # Seeded replay for reproducibility
```

CI additionally runs:
- Fuzz smoke pass (`scripts/fuzz.mjs --seed=fixed --scale=1`)
- Golden vector staleness guard (`git diff --exit-code golden-vectors.json`)

---

## Keeping maps current

Three documentation artifacts track project structure and MUST be updated
in the same commit that modifies structure or dependencies:

| File | What it tracks |
|------|---------------|
| `src/specs/WIREFRAME.md` | Mermaid.js diagrams: layers, dependencies, pipelines |
| [`src/specs/outline.xml`](src/specs/outline.xml) | Per-file descriptions of every source module |
| [`src/specs/test-outline.xml`](src/specs/test-outline.xml) | Per-file descriptions of every test file |

A stale map is treated as dead documentation and is a defect.

---

## Adding a new module

1. Write failing tests first (RED).
2. Create the module with stub exports so tests load.
3. Implement until GREEN.
4. Register the test file in `test/runner.js`.
5. Add the module to `src/specs/outline.xml` with a description.
6. Add test file(s) to `src/specs/test-outline.xml`.
7. Update `WIREFRAME.md` §3 edges if the module has cross-layer imports.
8. If cryptographic: verify PQ-resistance (symmetric only).
9. If wire-format-visible: regenerate golden vectors via `npm run vectors`.

---

## Testing conventions

### Property-based testing

Use the seeded harness in `test/utils/pbt.js`:

```js
import { Arbitrary, assertProperty } from '../utils/pbt.js';
await assertProperty([Arbitrary.byteArray(0, 600)], (data) => { ... }, 50);
```

Set `--seed=N` for reproducible runs. Counterexamples are shrunk automatically.

### Fuzz driver

Run `npm run fuzz --scale=5` for deeper exploration. CI runs scale=1 smoke.
All suites are registered in `test/fuzz/suites.mjs`.

### Counterexample protocol

When a property fails:
1. Pin the shrunk counterexample as an example-based regression test.
2. Fix the bug.
3. Both tests stay permanently.

---

## Commit style

Match the existing history format:

```
Wave X: short description - comma-separated highlights
```

Include body paragraphs for anything non-obvious. Reference spec sections,
RFC numbers, or audit finding IDs where relevant.

---

## Questions?

Open an issue. Include the output of `node scripts/cli.mjs verify --imagesDir ./stego --password "pw"`
if it's a carrier-related bug (redact passwords obviously).
