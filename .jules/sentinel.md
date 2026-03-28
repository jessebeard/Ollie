## 2026-03-28 - Math.random() usage for unique ID generation
**Vulnerability:** Weak randomness using Math.random() for UUID and unique ID generation.
**Learning:** Math.random() is cryptographically insecure and predictable. Using it to generate IDs in a security context (like chunk IDs or entry IDs) can lead to predictable IDs and potential collision or tracking attacks.
**Prevention:** Use webcrypto's randomUUID() or getRandomValues() for cryptographically secure ID generation.
