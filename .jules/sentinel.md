## 2024-04-04 - Fix Insecure Randomness in ID Generation

**Vulnerability:** Weak randomness using `Math.random()` in `PasswordVault.generateId()` to generate unique IDs. `Math.random()` is not cryptographically secure and can be predictable.

**Learning:** When generating unique IDs for security-sensitive contexts, always use cryptographically secure methods like UUIDv4.

**Prevention:** Use `cryptoInstance.randomUUID()` to ensure unique and secure identifiers.
