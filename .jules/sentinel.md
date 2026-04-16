## 2024-05-24 - Insecure Randomness in ID Generation

**Vulnerability:** The application used `Math.random()` to generate unique identifiers for password vault entries. `Math.random()` is cryptographically insecure and its outputs can be predicted by an attacker, leading to potential ID collisions or insecure object reference vulnerabilities.

**Learning:** Identifiers generated for security-sensitive contexts (like an encrypted password vault) must use cryptographically secure pseudo-random number generators (CSPRNG) to prevent predictability.

**Prevention:** Always use the Web Crypto API (`crypto.randomUUID()` or `crypto.getRandomValues()`) for generating unique identifiers and secrets. In this project, use the centralized `cryptoInstance.randomUUID()` from the compatibility layer.