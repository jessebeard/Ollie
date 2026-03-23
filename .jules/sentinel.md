## 2024-05-18 - [Insecure UUID Generation]

**Vulnerability:** Weak cryptographically insecure ID generation
The core application utilized `Math.random()` to generate IDs for vault entries in `immutable-vault.js` and for data chunks in `chunk-manager.js`. Attackers could exploit this predictability if they observed enough generated IDs.

**Learning:** `Math.random()` generates easily predictable values and is unfit for cryptographic or security-centric operations, especially in security products. Its use violates security guidelines.

**Prevention:** To avoid insecure randomness, developers must utilize Web Crypto API primitives like `crypto.randomUUID()` or `crypto.getRandomValues()` for unique IDs, secrets, and entropy generation. We established a secure pattern centrally through the new `generateSecureId` in `crypto-compat.js` for future use.