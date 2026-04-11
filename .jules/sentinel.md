## 2024-04-11 - [Predictable PRNG in ID Generation]
**Vulnerability:** The application used Math.random() to generate UUIDs for ChunkManager and IDs for PasswordVault.
**Learning:** Using non-cryptographically secure pseudo-random number generators (PRNGs) for unique identifiers can lead to predictable patterns, potentially enabling ID enumeration, collision, or state-recovery attacks.
**Prevention:** Always use the Web Crypto API's crypto.randomUUID() for generating UUIDs, or crypto.getRandomValues() for other random data requirements where security or unpredictability is a factor.
