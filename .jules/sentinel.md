## 2024-05-15 - [High] Insecure ID Generation via Math.random()

**Vulnerability:** ID generation functions in `PasswordVault` and `ChunkManager` utilized predictable sources of randomness, specifically `Math.random()` and `Date.now()`.

**Learning:** `Math.random()` is not cryptographically secure and uses a deterministic pseudo-random number generator algorithm. An attacker observing generated IDs or having insight into the state/time could theoretically predict prior or future generated IDs, which might allow ID-guessing, collision attacks, or correlation of chunk datasets and vault entries.

**Prevention:** Always use cryptographically secure sources of randomness, such as the Web Crypto API (`crypto.randomUUID()` or `crypto.getRandomValues()`), particularly for IDs, session keys, nonces, or any data intended to provide entropy, uniqueness, or unpredictability in a security context.