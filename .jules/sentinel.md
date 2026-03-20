## 2026-03-20 - Insecure UUID Generation

**Vulnerability:** Weak randomness in ID generation (`Math.random()`)

**Learning:** `Math.random()` does not provide cryptographically secure random numbers, making generated IDs predictable and prone to collisions, especially in a security context like a password vault.

**Prevention:** Always use Web Crypto API (`crypto.randomUUID()` or `crypto.getRandomValues()`) for generating unique identifiers and other security-sensitive random values.
