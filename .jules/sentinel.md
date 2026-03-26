## 2025-02-17 - Insecure Identifier Generation

**Vulnerability:** The application used `Math.random()` to generate unique IDs for vault entries in `PasswordVault.generateId()`. `Math.random()` is not cryptographically secure, and its outputs can be predicted or collide under certain conditions, potentially compromising the uniqueness or secrecy of generated identifiers.

**Learning:** When generating any form of identifier or random value in a security-sensitive context (like a steganographic password vault), predictable PRNGs like `Math.random()` must be avoided.

**Prevention:** Use cryptographically secure random number generators (CSPRNGs) such as `crypto.randomUUID()` or `crypto.getRandomValues()` provided by the Web Crypto API, which ensure high entropy and unpredictability.
