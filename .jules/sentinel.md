## 2024-05-19 - Insecure ID Generation

**Vulnerability:** The application used `Math.random()` to generate IDs for vault entries and chunk manager segments. Since `Math.random()` is not a cryptographically secure pseudo-random number generator (CSPRNG), an attacker could theoretically predict the output sequences, which can lead to ID collisions, spoofing, or tracking vulnerabilities.

**Learning:** `Math.random()` is fast but highly predictable. Operations involving security context (even unique IDs) must use secure randomness sources to guarantee an adequate level of entropy and unpredictability.

**Prevention:** Always use Web Crypto API primitives like `crypto.randomUUID()` or `crypto.getRandomValues()` when generating unique identifiers or tokens. Do not use `Math.random()` anywhere except for non-security-critical visual/rendering effects. In this codebase, consistently use `cryptoInstance` from `crypto-compat.js` for environment compatibility.
