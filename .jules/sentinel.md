## 2024-05-19 - Insecure ID Generation

**Vulnerability:** ID generation in PasswordVault and ChunkManager used `Math.random()`, which is a weak pseudo-random number generator that produces predictable outputs.

**Learning:** This could allow an attacker to predict ID sequences, guess IDs, or cause collisions, compromising the security of the vault and steganographic data.

**Prevention:** Use a cryptographically secure random number generator, such as `crypto.randomUUID()`, to guarantee uniqueness and unpredictability of identifiers in security-sensitive contexts.
