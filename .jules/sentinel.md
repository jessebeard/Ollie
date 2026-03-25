## 2024-03-25 - Predictable ID Generation using Math.random()

**Vulnerability:** The `Math.random()` function was being used to generate unique identifiers for password vault entries (`app/vault.js`, `src/structures/vault/immutable-vault.js`) and steganography chunks (`src/information-theory/steganography/chunk-manager.js`). `Math.random()` is not a cryptographically secure pseudo-random number generator (CSPRNG), making these IDs predictable and posing a security risk, such as IDOR or collision attacks.

**Learning:** Unpredictable identifiers are crucial for security-sensitive objects like password vault entries. `Math.random()` should never be used for security or cryptographic purposes. Modern environments provide secure alternatives via the Web Crypto API.

**Prevention:** Always use a CSPRNG, such as `crypto.randomUUID()` or `crypto.getRandomValues()`, to generate secure identifiers. We implemented a centralized `generateSecureId()` function in `src/information-theory/cryptography/crypto-compat.js` to handle this securely and compatibly. Additionally, we added Property-Based Tests (PBT) to verify the uniqueness and unpredictability of generated IDs automatically.
