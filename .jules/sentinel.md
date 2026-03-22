## 2025-02-17 - [ID Generation Math.random Vulnerability]

**Vulnerability:** ID generation in `ChunkManager` and `PasswordVault` relied on `Math.random()`, which is not cryptographically secure and could lead to predictable IDs or collisions.

**Learning:** When creating uniquely identifiable items, particularly in security contexts like a password vault, standard PRNGs are predictable. Attackers could guess subsequent IDs or induce collisions.

**Prevention:** Always use `crypto.randomUUID()` or `crypto.getRandomValues()` from the Web Crypto API instead of `Math.random()` for critical or unique identifier generation.
