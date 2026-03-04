# Code Quality Specs

1. **No Dependencies/Third-Party Libraries**: The project must be built entirely in plain JavaScript with no external dependencies or frameworks unless absolutely necessary and documented.
2. **Strict Mode**: All files must utilize `"use strict";` or be executed as ES Modules to guarantee secure scoping and avoid accidental globals.
3. **Defensive Programming**: Functions must validate parameters and boundaries explicitly. Methods taking objects should define expected types clearly.
4. **Environment Agnosticism**: Core logic (e.g. hashing, encoding, decoding) must execute agnostically and run efficiently on both browser engines and Node.js instances.
5. **Modern Syntax & Features**: Leverage modern ECMAScript features structurally (e.g. Classes, Promises, Maps), but avoid polyfills in target execution environments. 
6. **Robust Error Handling**: Code must not swallow errors. Utilize structured try-catch blocks over unpredictable failure modes to aid in deterministic testing results.
7. **Lazy Computation**: Do not compute what you do not need. Use explicit flags (e.g. `coefficientsOnly`) to gate expensive operations like IDCT, color conversion, and image assembly when only raw data structures are required.
8. **Explicit Option Flags**: Prefer explicit boolean options over implicit behavior. All optimization paths must be opt-in via named flags, never inferred from unrelated parameters.
9. **Dead Code Avoidance**: Do not import or maintain code paths that are not exercised by any production feature. Unused algorithm variants should be gated behind feature flags or removed entirely.
10. **Test-Driven Development (TDD)**: Code design must be guided by tests. Tests are written before implementation to define the exact expected behavior and boundaries. No feature code should exist without a corresponding test scenario that drove its creation.
11. **Property-Based Security & Validation**: Security and robustness must be validated through property-based testing (PBT). Instead of only testing specific examples, define invariant properties of the code (e.g., "AES decryption of ciphertext always matches original plaintext") and verify them against a wide range of auto-generated inputs.
12. **Determinism and Testability**: Code must be written to be fundamentally testable and deterministic. Avoid hidden state, side-effects, or hardcoded environment dependencies that make tests unreliable. Functions should act as pure data transformations wherever possible to enable rigorous automated verification.
