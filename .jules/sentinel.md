## 2025-02-14 - Replace insecure Math.random for PasswordVault IDs

**Vulnerability:** Weak Randomness (`Math.random()` used for generating secure entity IDs)

**Learning:** Using `Math.random` for generating object identifiers in a secure context (`PasswordVault`) is cryptographically insecure. It can lead to predictable IDs, which might be exploited if the ID sequence is analyzed.

**Prevention:** Always use cryptographically secure random number generators (CSPRNG), such as `crypto.randomUUID()`, for generating unique identifiers in security-sensitive features.
